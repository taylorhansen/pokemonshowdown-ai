/**
 * @file Runs the learning step repeatedly in order to collect memory and
 * performance stats for the current training config.
 *
 * Generates logs in CSV format.
 */
import * as tf from "@tensorflow/tfjs";
import {config} from "../../src/config";
import {createModel} from "../../src/model/model";
import {Learn} from "../../src/train/Learn";
import {importTf} from "../../src/util/importTf";
import {makeBatch, runProfile} from "./util";

Error.stackTraceLimit = Infinity;

tf.enableProdMode();

void (async function () {
    console.error(`TF Config: ${JSON.stringify(config.train.tf)}`);
    await importTf(config.train.tf);

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

    try {
        await runProfile(50, 10, config.train.learn.batchSize, step => {
            const batch = makeBatch(config.train.learn.batchSize);
            learn.step(step, batch).dispose();
            tf.dispose(batch);
        });
    } finally {
        learn.cleanup();
        model.dispose();
    }
})();
