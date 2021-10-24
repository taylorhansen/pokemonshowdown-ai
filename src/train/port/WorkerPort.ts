import { TransferListItem, Worker } from "worker_threads";
import { WrappedError } from "../helpers/WrappedError";
import { AsyncPort, ProtocolMessage, ProtocolResultRaw, ProtocolResult } from
    "./AsyncPort";
import { PortResultError } from "./PortProtocol";
import { WorkerProtocol } from "./WorkerProtocol";

/**
 * Wraps a `worker_threads` {@link Worker} to provide Promise functionality and
 * a safe close operation.
 *
 * @template TProtocol Defines all the request types that can be made to the
 * wrapped worker.
 * @template TTypes Protocol message types.
 */
export class WorkerPort
<
    TProtocol extends WorkerProtocol<TTypes>, TTypes extends string
>
{
    /** The underlying worker attached to this object. */
    public get worker(): Worker { return this.asyncPort.port; }

    /** Port wrapper. */
    private readonly asyncPort: AsyncPort<Worker, TProtocol, TTypes>;

    /**
     * Creates a WorkerPort.
     *
     * @param worker `worker_threads` Worker object.
     */
    public constructor(worker: Worker)
    {
        this.asyncPort = new AsyncPort(worker);
        worker.on("message",
            (res: ProtocolResultRaw<TProtocol, TTypes>) =>
                this.asyncPort.receiveMessage(res));
        worker.on("error",
            err => this.asyncPort.receiveError(
                new WrappedError(err,
                    msg => "Worker encountered an unhandled exception: " +
                        msg)));
    }

    /** Safely closes the worker. */
    public async close(): Promise<void>
    {
        // Send the close message and await a response.
        return await new Promise((res, rej) =>
            this.asyncPort.postMessage(
                {type: "close", rid: this.asyncPort.nextRid()}, [],
                result => result.type === "error" ?
                    rej((result as PortResultError).err) : res()));
    }

    /**
     * Sends and tracks a message through the port.
     *
     * This method can be wrapped over an abstraction layer by the caller to
     * provide an interface for their own message-passing protocols.
     *
     * @param msg Message to send that implements the protocol.
     * @param transferList Port/buffer transfer list to avoid copying.
     * @param callback Function to call when a reply is sent by the port. This
     * may be called multiple times until the `done` property of the argument is
     * true.
     */
    public postMessage<T extends TTypes>(
        msg: ProtocolMessage<TProtocol, TTypes, T>,
        transferList: readonly TransferListItem[],
        callback: (result: ProtocolResult<TProtocol, TTypes, T>) => void): void
    {
        this.asyncPort.postMessage(msg, transferList, callback)
    }

    /**
     * Generates a valid unique request id.
     *
     * Used to construct protocol messages.
     * @inheritdoc AsyncPort.nextRid
     */
    public nextRid(): number
    {
        return this.asyncPort.nextRid();
    }
}
