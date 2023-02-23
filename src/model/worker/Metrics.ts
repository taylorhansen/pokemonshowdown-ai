import {workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {importTfn, Tfn} from "../../util/tfn";
import {ModelWorkerData} from "./ModelProtocol";

const modelWorkerData = workerData as ModelWorkerData;

let writer: ReturnType<Tfn["node"]["summaryFileWriter"]> | undefined;
if (modelWorkerData?.metricsPath) {
    const tfn = importTfn(modelWorkerData.gpu);
    writer = tfn.node.summaryFileWriter(
        modelWorkerData.metricsPath,
        100 /*maxQueue*/,
    );
}

/** Used for writing model summary metrics to Tensorboard. */
export class Metrics {
    private static readonly instances = new Map<string, Metrics>();

    private constructor(public readonly name: string) {}

    /**
     * Gets a Metrics object for the given name. Returns null if
     * {@link ModelWorkerData.logPath} is not set.
     */
    public static get(name: string): Metrics | null {
        if (!writer) {
            return null;
        }
        let m = Metrics.instances.get(name);
        if (!m) {
            Metrics.instances.set(name, (m = new Metrics(name)));
        }
        return m;
    }

    /** Flushes the log writer. */
    public static flush(): void {
        writer?.flush();
    }

    private static ensureWriter(): NonNullable<typeof writer> {
        if (!writer) {
            throw new Error("No metrics writer available");
        }
        return writer;
    }

    /** Logs a scalar value. */
    public scalar(name: string, value: tf.Scalar | number, step: number) {
        Metrics.ensureWriter().scalar(`${this.name}/${name}`, value, step);
    }

    /** Writes a histogram summary of the data. */
    public histogram(
        name: string,
        data: tf.Tensor,
        step: number,
        buckets?: number,
    ) {
        Metrics.ensureWriter().histogram(
            `${this.name}/${name}`,
            data,
            step,
            buckets,
        );
    }
}
