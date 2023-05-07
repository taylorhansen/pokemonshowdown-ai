import * as tf from "@tensorflow/tfjs";
import {TensorflowConfig} from "../../config/types";
import {importTfn, Tfn} from "../../util/importTf";

type Writer = ReturnType<Tfn["node"]["summaryFileWriter"]>;

/** Used for writing model summary metrics to Tensorboard. */
export class Metrics {
    private static writer: Writer | null = null;

    private static readonly instances = new Map<string, Metrics>();

    private constructor(public readonly name: string) {}

    /**
     * Configures the metrics writer.
     *
     * @param path Path to store metrics in.
     * @param config Config used to configure TF instance.
     */
    public static configure(path: string, config: TensorflowConfig): void {
        if (config.backend !== "tensorflow") {
            throw new Error(
                "Metrics can only be configured using node ('tensorflow') " +
                    "backend",
            );
        }
        Metrics.writer = importTfn(config.gpu).node.summaryFileWriter(
            path,
            100 /*maxQueue*/,
        );
    }

    /**
     * Gets a Metrics object for the given name. Returns null if
     * {@link configure} hasn't been called yet.
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

    private static ensureWriter(): Writer {
        if (!Metrics.writer) {
            throw new Error("Metrics not configured");
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
