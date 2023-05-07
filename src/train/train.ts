import {join} from "path";
import {serialize} from "v8";
import * as tf from "@tensorflow/tfjs";
import type {NodeJSKernelBackend} from "@tensorflow/tfjs-node/dist/nodejs_kernel_backend";
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

    let saveCheckpoint: ((step: number) => Promise<void>) | undefined;
    if (paths?.models) {
        const modelUrl = pathToFileUrl(paths.models);
        const checkpointsPath = config.savePreviousVersions
            ? ensureDir(join(paths.models, "checkpoints"))
            : undefined;
        saveCheckpoint = async step =>
            void (await Promise.all(
                [
                    modelUrl,
                    checkpointsPath?.then(p =>
                        pathToFileUrl(join(p, `step-${step}`)),
                    ),
                ].map(async url => url && (await model.save(await url))),
            ));
    }

    const rolloutModel = new ModelRegistry("rollout");
    await rolloutModel.load(model);
    const [evalModel, prevModel] = await Promise.all(
        ["eval", "prev"].map(async name => {
            const reg = new ModelRegistry(name);
            await reg.load(await cloneModel(model));
            return reg;
        }),
    );
    const targetModel = await cloneModel(model);

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
        config.experience,
        paths?.logs ? join(paths.logs, "rollout") : undefined,
        seeders && {
            ...(seeders.battle && {battle: seeder(seeders.battle())}),
            ...(seeders.team && {team: seeder(seeders.team())}),
            ...(seeders.explore && {explore: seeder(seeders.explore())}),
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

    // Log initial weights.
    if (config.learn.histogramInterval) {
        learn.logWeights(0 /*step*/);
    }

    const evaluate =
        config.eval.interval > 0
            ? new Evaluate(
                  "train",
                  evalModel,
                  prevModel,
                  config.eval,
                  paths?.logs ? join(paths.logs, "eval") : undefined,
                  seeders && {
                      ...(seeders.battle && {battle: seeder(seeders.battle())}),
                      ...(seeders.team && {team: seeder(seeders.team())}),
                      ...(seeders.explore && {
                          explore: seeder(seeders.explore()),
                      }),
                  },
              )
            : null;
    const runEval =
        evaluate &&
        (async (step: number) =>
            await evaluate.run(
                step,
                callback &&
                    (gameResult => {
                        if (!config.eval.report && !gameResult.err) {
                            return;
                        }
                        callback({
                            type: "eval",
                            step,
                            id: gameResult.id,
                            agents: gameResult.agents,
                            ...(gameResult.winner !== undefined && {
                                winner: gameResult.winner,
                            }),
                            ...(gameResult.err && {
                                err: serialize(gameResult.err),
                            }),
                        });
                    }),
                callback && config.eval.report
                    ? result => callback({type: "evalDone", step, ...result})
                    : undefined,
            ));

    const logMemoryMetrics =
        metrics &&
        ((step: number) => {
            global.gc?.();

            const mem = process.memoryUsage();
            metrics.scalar("memory/rss", mem.rss, step);
            // Note: All stats except rss apply only to this thread.
            metrics.scalar("memory/heap_used", mem.heapUsed, step);
            metrics.scalar("memory/heap_total", mem.heapTotal, step);
            metrics.scalar("memory/external", mem.external, step);
            metrics.scalar("memory/array_buffers", mem.arrayBuffers, step);

            const tfMem = tf.memory();
            metrics.scalar("memory/tf_num_bytes", tfMem.numBytes, step);
            metrics.scalar("memory/tf_num_tensors", tfMem.numTensors, step);
            if (config.tf.backend === "tensorflow") {
                // Node backend tensor count seems to behave differently, might
                // be useful to track.
                metrics.scalar(
                    "memory/tf_num_node_tensors",
                    (tf.backend() as NodeJSKernelBackend).getNumOfTFTensors(),
                    step,
                );
            }
        });

    const replayBuffer = new ReplayBuffer(
        "train",
        config.experience.bufferSize,
    );
    const bufferRandom = config.seeds?.learn
        ? rng(config.seeds.learn)
        : undefined;

    await Promise.all([rollout.ready(), evaluate?.ready()]);

    const expGen = rollout.run(
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
        if (config.eval.interval) {
            lastEval = runEval?.(step);
            if (config.eval.sync) {
                await lastEval;
            } else {
                // Suppress unhandled exception warnings since we'll be awaiting
                // this promise later.
                lastEval?.catch(() => {});
            }
        }

        let i = 0;
        while (i < config.experience.prefill) {
            const r = await expGen.next();
            if (r.done) {
                throw new Error("Experience stream ended");
            }
            replayBuffer.add(r.value);
            ++i;
        }

        if (config.experience.metricsInterval) {
            replayBuffer.logMetrics(step);
        }
        if (config.metricsInterval) {
            logMemoryMetrics?.(step);
        }

        if (config.checkpointInterval) {
            await saveCheckpoint?.(step);
        }

        ++step;
        while (!config.steps || step <= config.steps) {
            const r = await expGen.next();
            if (r.done) {
                throw new Error("Experience stream ended");
            }
            replayBuffer.add(r.value);

            if (step % config.experience.metricsInterval === 0) {
                replayBuffer.logMetrics(step);
            }

            let loss: number | undefined;
            if (step % config.learn.interval === 0) {
                const batch = replayBuffer.sample(
                    config.learn.batchSize,
                    bufferRandom,
                );
                const lossTensor = learn.step(step, batch);
                tf.dispose(batch);

                if (step % config.learn.reportInterval === 0) {
                    [loss] = await lossTensor.data<"float32">();
                }

                lossTensor.dispose();
            }

            if (step % config.learn.histogramInterval === 0) {
                learn.logWeights(step);
            }

            if (step % config.learn.targetInterval === 0) {
                targetModel.setWeights(model.getWeights());
            }

            await rollout.step(step);

            if (step % config.eval.interval === 0) {
                await lastEval;

                prevModel.model.setWeights(evalModel.model.getWeights());
                evalModel.model.setWeights(model.getWeights());
                await Promise.all([rollout.reload("prev"), evaluate?.reload()]);

                lastEval = runEval?.(step);

                if (config.eval.sync) {
                    await lastEval;
                } else {
                    lastEval?.catch(() => {});
                }
            }
            if (step % config.checkpointInterval === 0) {
                await saveCheckpoint?.(step);
            }

            if (step % config.metricsInterval === 0) {
                logMemoryMetrics?.(step);
            }

            callback?.({
                type: "step",
                step,
                ...(loss !== undefined && {loss}),
            });

            ++step;
        }
        await Promise.all([rollout.terminate(), lastEval]);
        await evaluate?.close();
    } finally {
        await Promise.all([rollout.terminate(), evaluate?.terminate()]);
        learn.cleanup();
        await Promise.all([
            rolloutModel.unload(false /*disposeModel*/),
            evalModel.unload(),
            prevModel.unload(),
        ]);
        targetModel.dispose();
        Metrics.flush();
    }
    if (paths?.models) {
        await model.save(pathToFileUrl(paths.models));
    }
}
