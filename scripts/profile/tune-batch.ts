/**
 * @file Runs profiling steps to find the optimal batch size for training and
 * inference.
 *
 * It's very likely that this program will blow up your RAM and/or your GPU so
 * be warned.
 */
import * as tf from "@tensorflow/tfjs";
import {config} from "../../src/config";
import {createModel} from "../../src/model/model";
import {Learn} from "../../src/train/Learn";
import {importTfn} from "../../src/util/tfn";
import {logMemoryStats, makeBatch, makeState, profile} from "./util";

Error.stackTraceLimit = Infinity;

importTfn(config.tf.gpu);

const model = createModel(
    "tune-batch",
    config.train.model,
    config.train.seeds?.model,
);
// Gpu warmup.
tf.tidy(() => void model.predictOnBatch(makeState(1)));

void (async function () {
    logMemoryStats();

    const batchSizes = Array.from({length: 16}, (_, i) => 2 ** i);
    for (const batchSize of batchSizes) {
        const batch = makeBatch(batchSize);

        await profile("infer", batchSize, () =>
            tf.dispose(model.predictOnBatch(batch.state)),
        );

        const learn = new Learn(
            "tune-batch",
            model,
            model,
            {...config.train.learn, batchSize},
            config.train.experience,
        );
        await profile("learn", batchSize, () => learn.step(1, batch).dispose());
        learn.cleanup();

        tf.dispose(batch);
        logMemoryStats();
    }
})();
