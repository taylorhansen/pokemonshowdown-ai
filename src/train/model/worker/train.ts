import {join} from "path";
import {serialize} from "v8";
import * as tf from "@tensorflow/tfjs";
import {PathsConfig, TrainConfig} from "../../../config/types";
import {ensureDir} from "../../../util/paths/ensureDir";
import {pathToFileUrl} from "../../../util/paths/pathToFileUrl";
import {seeder} from "../../../util/random";
import {GameArgsGenSeeders} from "../../game/pool";
import {Evaluate} from "./Evaluate";
import {Learn} from "./Learn";
import {Metrics} from "./Metrics";
import {ModelTrainData} from "./ModelProtocol";
import {ModelRegistry} from "./ModelRegistry";
import {Rollout} from "./Rollout";
import {datasetFromRollout} from "./dataset";

/**
 * Main training loop.
 *
 * @param model Model to train.
 * @param config Training config.
 * @param paths Optional paths to store model checkpoints, game logs, and
 * metrics.
 * @param callback Callback for notifying the main thread of various events
 * during each episode, including errors.
 */
export async function train(
    model: ModelRegistry,
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

    const [rolloutModel, prevModel, targetModel] = await Promise.all(
        ["rollout", "prev", "target"].map(
            async name => await model.clone(name),
        ),
    );

    const seeders: GameArgsGenSeeders | undefined = config.seeds && {
        ...(config.seeds.battle && {battle: seeder(config.seeds.battle)}),
        ...(config.seeds.team && {team: seeder(config.seeds.team)}),
        ...(config.seeds.explore && {explore: seeder(config.seeds.explore)}),
    };

    rolloutModel.lock("train", 0 /*step*/);
    prevModel.lock("train", 0);

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

    const dataset = datasetFromRollout(
        rollout.gen(
            callback &&
                (result =>
                    callback({
                        type: "rollout",
                        id: result.id,
                        ...(result.err && {err: serialize(result.err)}),
                    })),
        ),
        config.learn.buffer,
        config.seeds?.learn,
    );
    const learn = new Learn(
        "train",
        model.model,
        targetModel.model,
        await dataset.iterator(),
        config.learn,
    );

    const evaluate = new Evaluate(
        "train",
        rolloutModel,
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

    let lastEval: Promise<unknown> | undefined;
    try {
        rolloutModel.unlock();
        prevModel.unlock();
        rolloutModel.lock("train", 1);
        prevModel.lock("train", 1);
        logMemoryMetrics(0);

        for (let i = 0; i < config.episodes; ++i) {
            const step = i + 1;
            callback?.({type: "episode", step});
            const loss = await learn.episode(step, (batchStep, batchLoss) =>
                callback?.({type: "batch", step: batchStep, loss: batchLoss}),
            );
            await lastEval;
            callback?.({type: "learn", loss});

            logMemoryMetrics(step);

            rollout.step(step);
            rolloutModel.unlock();
            prevModel.unlock();
            if (i < config.episodes) {
                rolloutModel.lock("train", step + 1);
                prevModel.lock("train", step + 1);
                rolloutModel.copyTo(prevModel);
            }
            model.copyTo(rolloutModel);
            model.copyTo(targetModel);

            lastEval = Promise.all([
                evaluate
                    .run(
                        step,
                        callback &&
                            (result =>
                                callback({
                                    type: "eval",
                                    step,
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
                    .then(
                        callback &&
                            (wlt => callback({type: "evalDone", step, wlt})),
                    ),
                ...(checkpointsPath
                    ? [
                          rolloutModel.save(
                              pathToFileUrl(
                                  join(checkpointsPath, `episode-${step}`),
                              ),
                          ),
                      ]
                    : []),
                ...(paths?.models
                    ? [rolloutModel.save(pathToFileUrl(paths.models))]
                    : []),
            ]);
            // Suppress unhandled exception warnings since we'll await this
            // promise later.
            lastEval.catch(() => {});
        }
    } finally {
        await lastEval;
        await Promise.all([rollout.cleanup(), evaluate.cleanup()]);
        learn.cleanup();
        for (const m of [rolloutModel, prevModel, targetModel]) {
            m.unload();
        }
    }
}
