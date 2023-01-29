import {join} from "path";
import {serialize} from "v8";
import * as tf from "@tensorflow/tfjs";
import {PathsConfig, TrainConfig} from "../config/types";
import {GameArgsGenSeeders} from "../game/pool";
import {ModelTrainData} from "../model/worker";
import {Metrics} from "../model/worker/Metrics";
import {ModelRegistry} from "../model/worker/ModelRegistry";
import {cloneModel} from "../util/model";
import {ensureDir} from "../util/paths/ensureDir";
import {pathToFileUrl} from "../util/paths/pathToFileUrl";
import {rng, seeder} from "../util/random";
import {Evaluate} from "./Evaluate";
import {Learn} from "./Learn";
import {ReplayBuffer} from "./ReplayBuffer";
import {Rollout} from "./Rollout";
import {RolloutModel} from "./RolloutModel";

/**
 * Main training loop.
 *
 * @param model Model to train.
 * @param config Training config.
 * @param paths Optional paths to store model checkpoints, game logs, and
 * metrics.
 * @param callback Callback for notifying the main thread of various events
 * during each step, including errors.
 */
export async function train(
    model: tf.LayersModel,
    config: TrainConfig,
    paths?: Partial<PathsConfig>,
    callback?: (data: ModelTrainData) => void,
): Promise<void> {
    const metrics = Metrics.get("train");

    let checkpointsPath: string | undefined;
    if (paths?.models) {
        checkpointsPath = join(paths.models, "checkpoints");
        await Promise.all([
            (async function () {
                await ensureDir(checkpointsPath),
                    await model.save(
                        pathToFileUrl(join(checkpointsPath, "original")),
                    );
            })(),
            model.save(pathToFileUrl(paths.models)),
        ]);
    }

    const rolloutModel = new RolloutModel("rollout", model);
    const [evalModel, prevModel] = await Promise.all(
        ["eval", "prev"].map(
            async name =>
                new ModelRegistry(
                    name,
                    await cloneModel(model),
                    config.batchPredict,
                ),
        ),
    );
    const targetModel = await cloneModel(model);

    evalModel.lock("train", 0 /*step*/);
    prevModel.lock("train", 0);

    const seeders: GameArgsGenSeeders | undefined = config.seeds && {
        ...(config.seeds.battle && {battle: seeder(config.seeds.battle)}),
        ...(config.seeds.team && {team: seeder(config.seeds.team)}),
        ...(config.seeds.explore && {explore: seeder(config.seeds.explore)}),
    };

    const rollout = new Rollout(
        "train",
        rolloutModel,
        prevModel,
        config.rollout,
        paths?.logs ? join(paths.logs, "rollout") : undefined,
        {
            ...seeders,
            ...(config.seeds?.rollout && {
                rollout: seeder(config.seeds.rollout),
            }),
        },
    );

    const learn = new Learn(
        "train",
        model,
        targetModel,
        config.learn,
        config.experience,
    );

    const evaluate = new Evaluate(
        "train",
        evalModel,
        prevModel,
        config.eval,
        paths?.logs ? join(paths.logs, "eval") : undefined,
        seeders && {
            ...(seeders.battle && {battle: seeder(seeders.battle())}),
            ...(seeders.team && {team: seeder(seeders.team())}),
            ...(seeders.explore && {explore: seeder(seeders.explore())}),
        },
    );

    const logMemoryMetrics = (step: number) => {
        if (metrics) {
            const memory = tf.memory();
            metrics.scalar("memory/num_bytes", memory.numBytes, step);
            metrics.scalar("memory/num_tensors", memory.numTensors, step);
        }
    };

    const replayBuffer = new ReplayBuffer(config.experience.bufferSize);
    const bufferRandom = config.seeds?.learn
        ? rng(config.seeds.learn)
        : undefined;

    void rollout.run(
        callback &&
            (result =>
                callback({
                    type: "rollout",
                    id: result.id,
                    ...(result.err && {err: serialize(result.err)}),
                })),
    );

    let lastEval: Promise<unknown> | undefined;
    try {
        let step = 0;
        evalModel.unlock();
        prevModel.unlock();

        let i = 0;
        while (i < config.experience.prefill) {
            const exps = await rolloutModel.step();
            for (const exp of exps) {
                replayBuffer.add(exp);
                ++i;
            }
        }

        evalModel.lock("train", step);
        prevModel.lock("train", step);

        logMemoryMetrics(step);

        ++step;
        while (!config.steps || step < config.steps) {
            const exps = await rolloutModel.step();
            for (const exp of exps) {
                if (config.steps && step >= config.steps) {
                    break;
                }
                replayBuffer.add(exp);
                const loss = tf.tidy(() =>
                    learn.step(
                        step,
                        replayBuffer.sample(
                            config.learn.batchSize,
                            bufferRandom,
                        ),
                    ),
                );
                callback?.({
                    type: "learn",
                    step,
                    loss: (await loss.data<"float32">())[0],
                });
                loss.dispose();

                rollout.step(step);
                logMemoryMetrics(step);

                if (step % config.learn.targetInterval === 0) {
                    targetModel.setWeights(model.getWeights());
                }

                if (step % config.eval.interval === 0) {
                    await lastEval;

                    evalModel.unlock();
                    prevModel.unlock();
                    prevModel.model.setWeights(evalModel.model.getWeights());
                    evalModel.model.setWeights(model.getWeights());
                    evalModel.lock("train", step);
                    prevModel.lock("train", step);

                    const evalStep = step;
                    lastEval = evaluate
                        .run(
                            evalStep,
                            callback &&
                                (result =>
                                    callback({
                                        type: "eval",
                                        step: evalStep,
                                        id: result.id,
                                        agents: result.agents,
                                        ...(result.winner !== undefined && {
                                            winner: result.winner,
                                        }),
                                        ...(result.err && {
                                            err: serialize(result.err),
                                        }),
                                    })),
                        )
                        .then(wlt =>
                            callback?.({type: "evalDone", step: evalStep, wlt}),
                        );
                    // Suppress unhandled exception warnings since we'll await
                    // this promise later.
                    lastEval.catch(() => {});
                }
                if (
                    config.checkpointInterval &&
                    step % config.checkpointInterval === 0
                ) {
                    // TODO: Use a separate model copy so this isn't blocking.
                    await Promise.all(
                        [
                            ...(paths?.models
                                ? [pathToFileUrl(paths.models)]
                                : []),
                            ...(config.savePreviousVersions && checkpointsPath
                                ? [
                                      pathToFileUrl(
                                          join(checkpointsPath, `step-${step}`),
                                      ),
                                  ]
                                : []),
                        ].map(async url => await model.save(url)),
                    );
                }

                // Async yield to allow for evaluate step to run in parallel.
                await tf.nextFrame();

                ++step;
            }
        }
        await lastEval;
        await evaluate.close();
    } finally {
        await Promise.all([rollout.terminate(), evaluate.terminate()]);
        replayBuffer.dispose();
        learn.cleanup();
        for (const m of [rolloutModel, evalModel, prevModel]) {
            m.unload();
        }
        targetModel.dispose();
    }
    if (paths?.models) {
        await model.save(pathToFileUrl(paths.models));
    }
}
