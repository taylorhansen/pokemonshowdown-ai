import {workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {importTfn} from "../../util/tfn";
import {ModelWorkerData} from "./ModelProtocol";

const modelWorkerData = workerData as ModelWorkerData;

/** Used for writing model summary metrics to Tensorboard. */
export class Metrics {
    private static readonly writer = modelWorkerData?.metricsPath
        ? importTfn(modelWorkerData.gpu).node.summaryFileWriter(
              modelWorkerData.metricsPath,
              100 /*maxQueue*/,
          )
        : null;

    private static readonly instances = new Map<string, Metrics>();

    private constructor(public readonly name: string) {}

    /**
     * Gets a Metrics object for the given name. Returns null if
     * {@link ModelWorkerData.metricsPath} is not set.
     */
    public static get(name: string): Metrics | null {
        if (!Metrics.writer) {
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
        Metrics.writer?.flush();
    }

    private static ensureWriter(): NonNullable<typeof Metrics.writer> {
        if (!Metrics.writer) {
            throw new Error("Metrics path not configured");
        }
        return Metrics.writer;
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
