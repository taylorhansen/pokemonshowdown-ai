import { PortMessageBase, PortResultBase } from
    "../../nn/worker/helpers/AsyncPort";

/**
 * Mapped type for request types. Includes a `close` message definition to
 * facilitate closing the worker.
 */
export type WorkerRequestMap<T extends string> =
{
    [U in T]: {message: PortMessageBase<U>, result: PortResultBase<U>}
} & WorkerCloseProtocol;

/** Protocol type for workers to handle WorkerClose message. */
export type WorkerCloseProtocol =
    {close: {message: WorkerClose, result: WorkerClosed}};

/** Indicates that the worker should finish what it's doing then close. */
export interface WorkerClose extends PortMessageBase<"close"> {}

/**
 * Indicates that the worker has finished everything it needed to do and can be
 * safely terminated.
 */
export interface WorkerClosed extends PortResultBase<"close">
{
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
    /** Pipeline error buffer. */
    err?: Buffer;
}
