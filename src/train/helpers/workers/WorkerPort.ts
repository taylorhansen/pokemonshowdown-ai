import { Worker } from "worker_threads";
import { AsyncPort, PortResultError } from "../../nn/worker/helpers/AsyncPort";
import { WorkerRequestMap } from "./WorkerRequest";

/**
 * Wraps a Worker thread to provide Promise functionality and a safe close
 * operation.
 */
export class WorkerPort<TMap extends WorkerRequestMap<string>> extends
    AsyncPort<TMap, Worker>
{
    /** The underlying worker attached to this object. */
    public get worker(): Worker { return this.port; };

    /** @override */
    public close(): Promise<void>
    {
        // send the close message and await a response
        return new Promise((res, rej) =>
            this.postMessage({type: "close", rid: this.generateRID()}, [],
                result => result.type === "error" ?
                    rej((result as PortResultError).err) : res()));
    }
}
