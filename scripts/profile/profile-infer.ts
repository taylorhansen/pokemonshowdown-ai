/**
 * @file Runs model inferences repeatedly in order to collect memory and
 * performance stats for the current training config.
 *
 * Generates logs in CSV format.
 */
import * as tf from "@tensorflow/tfjs";
import {config} from "../../src/config";
import {createModel} from "../../src/model/model";
import {importTf} from "../../src/util/importTf";
import {makeState, runProfile} from "./util";

Error.stackTraceLimit = Infinity;

tf.enableProdMode();

void (async function () {
    console.error(`TF Config: ${JSON.stringify(config.train.tf)}`);
    await importTf(config.train.tf);

    const model = createModel(
        "profile-infer",
        config.train.model,
        config.train.seeds?.model,
    );

    try {
        await runProfile(50, 10, config.train.learn.batchSize, () => {
            const batch = makeState(config.train.learn.batchSize);
            tf.dispose(model.predictOnBatch(batch));
            tf.dispose(batch);
        });
    } finally {
        model.dispose();
    }
})();
