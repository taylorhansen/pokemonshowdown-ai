import * as tf from "@tensorflow/tfjs";
import {BatchTensorExperience} from "../../src/game/experience/tensor";
import {modelInputShapes} from "../../src/model/shapes";
import {intToChoice} from "../../src/psbot/handlers/battle/agent";
import {formatUptime} from "../../src/util/format";

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

export function log(step: number, type: string, value: number | string) {
    console.log(`${step},${formatUptime(process.uptime())},${type},${value}`);
}

export function logMemoryStats(step: number) {
    global.gc?.();

    const nodeMem = process.memoryUsage();
    log(step, "rss", nodeMem.rss);
    log(step, "heap_used", nodeMem.heapUsed);
    log(step, "heap_total", nodeMem.heapTotal);
    log(step, "ext", nodeMem.external);
    log(step, "array_buffers", nodeMem.arrayBuffers);

    const tfMem = tf.memory();
    log(step, "tf_bytes", tfMem.numBytes);
    log(step, "tf_tensors", tfMem.numTensors);
    log(step, "tf_buffers", tfMem.numDataBuffers);
}

export function median(arr: number[]): number {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    if (arr.length % 2 === 0) {
        return (arr[mid] + arr[mid + 1]) / 2;
    }
    return arr[mid];
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

export async function runProfile(
    steps: number,
    invasiveInterval: number,
    size: number,
    f: (step: number) => void,
) {
    const times: number[] = [];
    const throughputsS: number[] = [];

    console.error(
        `Config: steps=${steps}, invasive=${invasiveInterval}, size=${size}`,
    );

    console.log("step,time,type,value");
    for (let i = 0; i <= steps; ++i) {
        if (i % invasiveInterval === 0) {
            const profileInfo = await tf.profile(() => f(i));
            log(i, "peak_bytes", profileInfo.peakBytes);
            log(i, "new_bytes", profileInfo.newBytes);
            log(i, "new_tensors", profileInfo.newTensors);
            logMemoryStats(i);
        } else {
            const startTime = process.hrtime.bigint();
            f(i);
            const endTime = process.hrtime.bigint();
            const time = Number(endTime - startTime);
            const thruS = size / (time / 1e9);
            log(i, "time_ms", (time / 1e6).toFixed(1));
            log(i, "through_s", thruS.toFixed(1));
            times.push(time);
            throughputsS.push(thruS);
        }
    }
    console.error(`Median step time: ${humanTime(median(times))}ms`);
    console.error(`Median throughput: ${humanNumber(median(throughputsS))}/s`);
    console.error("Runtime: " + formatUptime(process.uptime()));
}
