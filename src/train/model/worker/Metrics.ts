import {workerData} from "worker_threads";
import * as tf from "@tensorflow/tfjs";
import {importTfn} from "../../../util/tfn";
import {ModelWorkerData} from "./ModelProtocol";

const {gpu, logPath} = workerData as ModelWorkerData;
const tfn = importTfn(gpu);

/** Used for writing model summary metrics. */
export class Metrics {
    private static readonly writer = logPath
        ? tfn.node.summaryFileWriter(logPath)
        : null;
    private static readonly instances = new Map<string, Metrics>();

    private constructor(public readonly name: string) {}

    /**
     * Gets a Metrics object for the given name. Returns null if
     * {@link ModelWorkerData.logPath} is not set.
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

    private static ensureWriter(): NonNullable<typeof Metrics["writer"]> {
        if (!Metrics.writer) {
            throw new Error("No metrics writer available");
        }
        return Metrics.writer;
    }

    /** Logs a scalar value. */
    public scalar(name: string, value: tf.Scalar | number, step: number) {
        Metrics.ensureWriter().scalar(`${this.name}/${name}`, value, step);
    }

    /** Logs the weights of a model for visualization via histograms. */
    public logWeights(name: string, model: tf.LayersModel, step: number) {
        const writer = Metrics.ensureWriter();
        for (const weights of model.weights) {
            writer.histogram(
                `${this.name}/${name}/${weights.name}`,
                weights.read(),
                step,
            );
        }
    }
}
