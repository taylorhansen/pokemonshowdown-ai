/** @file Defines the base protocol typings for WorkerPorts. */
import { PortMessageBase, PortProtocol, PortResultBase } from "./PortProtocol";

/**
 * Base type for WorkerPort request protocol typings.
 *
 * Includes a `"close"` message type to facilitate closing the worker.
 *
 * @template T String union of request types.
 */
export type WorkerProtocol<T extends string> =
    PortProtocol<T> & WorkerCloseProtocol;

/** Protocol type for workers to handle WorkerClose messages. */
export interface WorkerCloseProtocol extends PortProtocol<"close">
{
    close: {message: WorkerClose, result: WorkerClosed}
}

/** Indicates that the worker should finish what it's doing then close. */
export interface WorkerClose extends PortMessageBase<"close"> {}

/**
 * Indicates that the worker has finished everything it needed to do and can be
 * safely terminated.
 */
export interface WorkerClosed extends PortResultBase<"close">
{
    /** @override */
    done: true;
}
