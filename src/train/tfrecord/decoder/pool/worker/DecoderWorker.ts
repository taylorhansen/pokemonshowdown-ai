import { Worker } from "worker_threads";
import { AugmentedExperience } from "../../../../play/experience";
import { WorkerPort } from "../../../../port/WorkerPort";
import { DecodeMessage, DecoderProtocol } from "./DecoderProtocol";

/** Wraps a DecoderPool worker to provide type-safe Promise functionality. */
export class DecoderWorker
{
    /** Worker wrapper. */
    private readonly workerPort:
        WorkerPort<DecoderProtocol, keyof DecoderProtocol>;

    /**
     * Creates a DecoderWorker.
     *
     * @param worker `worker_threads` Worker object.
     */
    constructor(worker: Worker)
    {
        this.workerPort = new WorkerPort(worker);
    }

    /** Safely closes the worker. */
    public async close(): Promise<void> { await this.workerPort.close(); }

    /**
     * Asks for the next AugmentedExperience in the given tfrecord file.
     *
     * Intended to be called multiple times with the same `path` until this
     * function returns `null`, in which case the worker has reached the end of
     * the file and the next call would restart from the beginning.
     */
    public decode(path: string): Promise<AugmentedExperience | null>
    {
        const msg: DecodeMessage =
            {type: "decode", rid: this.workerPort.nextRid(), path};
        return new Promise((res, rej) =>
            this.workerPort.postMessage<"decode">(msg, [],
                result => result.type === "error" ?
                    rej(result.err) : res(result.aexp)));
    }
}
