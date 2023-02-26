/**
 * @file Runs profiling steps to find the optimal batch size for training and
 * inference.
 *
 * It's very likely that this program will blow up your RAM and/or your GPU so
 * be warned.
 */
import * as tf from "@tensorflow/tfjs";
import {config} from "../src/config";
import {BatchTensorExperience} from "../src/game/experience/tensor";
import {createModel} from "../src/model/model";
import {modelInputShapes} from "../src/model/shapes";
import {intToChoice} from "../src/psbot/handlers/battle/agent";
import {Learn} from "../src/train/Learn";
import {importTfn} from "../src/util/tfn";

Error.stackTraceLimit = Infinity;

importTfn(config.tf.gpu);

const model = createModel(
    "tune-batch",
    config.train.model,
    config.train.seeds?.model,
);
// Gpu warmup.
tf.tidy(() => void model.predictOnBatch(makeState(1)));

function makeBatch(batchSize: number): BatchTensorExperience {
    return {
        state: makeState(batchSize),
        action: tf.randomUniform([batchSize], 0, intToChoice.length, "int32"),
        reward: tf.randomStandardNormal([batchSize]),
        nextState: makeState(batchSize),
        choices: tf.randomUniform([batchSize, intToChoice.length]).less(0.9),
        done: tf.randomUniform([batchSize]).less(0.1).cast("float32"),
    };
}

function makeState(batchSize: number): tf.Tensor[] {
    return modelInputShapes.map(shape =>
        tf.randomUniform([batchSize, ...shape]),
    );
}

function logMemoryStats() {
    global.gc?.();
    const nodeMem = process.memoryUsage();
    console.log(
        "process: " +
            `rss=${humanBytes(nodeMem.rss)}, ` +
            `heap=${humanBytes(nodeMem.heapUsed)}/${humanBytes(
                nodeMem.heapTotal,
            )}, ` +
            `ext=${humanBytes(nodeMem.external)}, ` +
            `arr=${humanBytes(nodeMem.arrayBuffers)}`,
    );
    const tfMem = tf.memory();
    console.log(
        "tensorflow: " +
            `bytes=${humanBytes(tfMem.numBytes)}, ` +
            `tensors=${humanNumber(tfMem.numTensors)}, ` +
            `buffers=${humanNumber(tfMem.numDataBuffers)}`,
    );
}

async function profile(
    name: string,
    size: number,
    f: () => void,
): Promise<void> {
    let runtime: number;
    const info = await tf.profile(() => {
        const start = process.hrtime.bigint();
        tf.tidy(f);
        const end = process.hrtime.bigint();
        runtime = Number(end - start);
    });
    console.log(
        `${name}(${size}): ` +
            `new tensors ${humanNumber(info.newTensors)} ` +
            `(${humanBytes(info.newBytes)}), ` +
            `peak ${humanBytes(info.peakBytes)}, ` +
            `time ${humanTime(runtime!)}, ` +
            `through ${humanNumber(size / (runtime! / 1e9))}/s`,
    );
}

function toSiUnits(n: number, units: readonly string[]) {
    for (let i = 0; i < units.length; ++i) {
        if (n < 1000) {
            return n.toFixed(i === 0 ? 0 : 1) + units[i];
        }
        if (i + 1 < units.length) {
            n /= 1000;
        }
    }
    return n.toFixed(1) + units[units.length - 1];
}

const numUnits = ["", "k", "M", "B"];
function humanNumber(num: number): string {
    return toSiUnits(num, numUnits);
}

const byteUnits = ["B", "kB", "MB", "GB"];
function humanBytes(bytes: number): string {
    return toSiUnits(bytes, byteUnits);
}

const timeUnits = ["ns", "us", "ms", "s"];
function humanTime(ns: number): string {
    return toSiUnits(ns, timeUnits);
}

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
