/**
 * @file Runs the learning step repeatedly in order to collect memory and
 * performance stats for the current training config.
 */
import * as tf from "@tensorflow/tfjs";
import {config} from "../../src/config";
import {createModel} from "../../src/model/model";
import {Learn} from "../../src/train/Learn";
import {formatUptime} from "../../src/util/format";
import {importTfn} from "../../src/util/tfn";
import {logMemoryStats, makeBatch, profile} from "./util";

Error.stackTraceLimit = Infinity;

importTfn(config.tf.gpu);

const model = createModel(
    "profile-learn",
    config.train.model,
    config.train.seeds?.model,
);

const learn = new Learn(
    "profile-learn",
    model,
    model,
    {
        ...config.train.learn,
        histogramInterval: 0,
        metricsInterval: 0,
        reportInterval: 0,
    },
    config.train.experience,
);

function step(i: number) {
    const batch = makeBatch(config.train.learn.batchSize);
    learn.step(i, batch).dispose();
    tf.dispose(batch);
}

void (async function () {
    logMemoryStats();
    for (let i = 0; i <= 100_000; ++i) {
        if (i % 10_000 === 0) {
            console.log(`${i}: ${formatUptime(process.uptime())}`);
            await profile("learn", config.train.learn.batchSize, () => step(i));
            logMemoryStats();
        } else {
            step(i);
        }
    }
})().finally(() => {
    learn.cleanup();
    model.dispose();
    console.log("Uptime: " + formatUptime(process.uptime()));
});
