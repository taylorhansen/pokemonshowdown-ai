import * as tf from "@tensorflow/tfjs";
import {BatchTensorExperience} from "../../src/game/experience/tensor";
import {modelInputShapes} from "../../src/model/shapes";
import {intToChoice} from "../../src/psbot/handlers/battle/agent";

export function makeBatch(batchSize: number): BatchTensorExperience {
    return tf.tidy(() => ({
        state: makeState(batchSize),
        action: tf.randomUniform([batchSize], 0, intToChoice.length, "int32"),
        reward: tf.randomStandardNormal([batchSize]),
        nextState: makeState(batchSize),
        choices: tf.randomUniform([batchSize, intToChoice.length]).less(0.9),
        done: tf.randomUniform([batchSize]).less(0.1).cast("float32"),
    }));
}

export function makeState(batchSize: number): tf.Tensor[] {
    return modelInputShapes.map(shape =>
        tf.randomUniform([batchSize, ...shape]),
    );
}

export function logMemoryStats() {
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

export async function profile(name: string, size: number, f: () => void) {
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
    return info;
}

/** Converts to given SI units given a list of unit denominations. */
export function toSiUnits(n: number, units: readonly string[], decimals = 1) {
    for (let i = 0; i < units.length; ++i) {
        if (n < 1000) {
            return n.toFixed(i === 0 ? 0 : decimals) + units[i];
        }
        if (i + 1 < units.length) {
            n /= 1000;
        }
    }
    return n.toFixed(1) + units[units.length - 1];
}

const numUnits = ["", "k", "M", "B", "T"];

/** Stringifies number with thousands marker. */
export function humanNumber(num: number, decimals = 1): string {
    return toSiUnits(num, numUnits, decimals);
}

const byteUnits = ["B", "kB", "MB", "GB", "TB"];

/** Stringifies number of bytes with unit denominations. */
export function humanBytes(bytes: number, decimals = 1): string {
    return toSiUnits(bytes, byteUnits, decimals);
}

const timeUnits = ["ns", "us", "ms", "s"];

/** Stringifies number of nanoseconds with unit denominations up to seconds. */
export function humanTime(ns: number, decimals = 1): string {
    return toSiUnits(ns, timeUnits, decimals);
}
