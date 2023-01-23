import {join} from "path";
import {serialize} from "v8";
import * as tf from "@tensorflow/tfjs";
import {TrainConfig} from "../../../config/types";
import {pathToFileUrl} from "../../../util/paths/pathToFileUrl";
import {seeder} from "../../../util/random";
import {GameArgsGenSeeders} from "../../game/pool";
import {Evaluate} from "./Evaluate";
import {Learn} from "./Learn";
import {ModelTrainData} from "./ModelProtocol";
import {ModelRegistry} from "./ModelRegistry";
import {Rollout} from "./Rollout";
import {datasetFromRollout} from "./dataset";

/**
 * Main training loop.
 *
 * @param model Model to train.
 * @param config Training config.
 * @param modelPath Path to store model checkpoints.
 * @param logPath Path to store game logs.
 * @param callback Callback for notifying the main thread of various events
 * during each episode, including errors.
 */
export async function train(
    model: ModelRegistry,
    config: TrainConfig,
    modelPath?: string,
    logPath?: string,
    callback?: (data: ModelTrainData) => void,
): Promise<void> {
    if (modelPath) {
        await model.save(pathToFileUrl(join(modelPath, "original")));
    }

    const [rolloutModel, prevModel] = await Promise.all([
        model.clone("rollout"),
        model.clone("prev"),
    ]);

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
        logPath && join(logPath, "rollout"),
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
        await dataset.iterator(),
        config.learn,
    );

    const evaluate = new Evaluate(
        "train",
        rolloutModel,
        prevModel,
        config.eval,
        logPath && join(logPath, "eval"),
        seeders && {
            ...(seeders.battle && {battle: seeder(seeders.battle())}),
            ...(seeders.team && {team: seeder(seeders.team())}),
            ...(seeders.explore && {explore: seeder(seeders.explore())}),
        },
    );

    let lastEval: Promise<unknown> | undefined;
    try {
        rolloutModel.unlock();
        prevModel.unlock();
        rolloutModel.lock("train", 1);
        prevModel.lock("train", 1);

        for (let i = 0; i < config.episodes; ++i) {
            const step = i + 1;
            callback?.({type: "episode", step});
            const loss = await learn.episode(step, (batchStep, batchLoss) =>
                callback?.({type: "batch", step: batchStep, loss: batchLoss}),
            );
            await lastEval;
            console.log(JSON.stringify(tf.memory())); // TODO: Move to tensorboard.
            callback?.({type: "learn", loss});

            rollout.step(step);
            rolloutModel.unlock();
            prevModel.unlock();
            if (i < config.episodes) {
                rolloutModel.lock("train", step + 1);
                prevModel.lock("train", step + 1);
                rolloutModel.copyTo(prevModel);
            }
            model.copyTo(rolloutModel);

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
                ...(modelPath
                    ? [
                          rolloutModel.save(
                              pathToFileUrl(join(modelPath, `episode-${step}`)),
                          ),
                          rolloutModel.save(
                              pathToFileUrl(join(modelPath, "latest")),
                          ),
                      ]
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
        rolloutModel.unload();
        prevModel.unload();
    }
}
