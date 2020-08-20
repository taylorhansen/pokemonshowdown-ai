import { deserialize } from "v8";
import { MessagePort } from "worker_threads";

/** Base type for AsyncPort request typings. */
export type PortRequestMap<T extends string> =
{
    [U in T]:
    {
        message: PortMessageBase<U>;
        result: PortResultBase<U>;
    }
};

/** Base interface for Async port requests. */
export interface PortRequestBase<T extends string>
{
    type: T;
    rid: number;
}

/** Base interface for port messages. */
export type PortMessageBase<T extends string> = Readonly<PortRequestBase<T>>;

/** Base interface for port message results. */
export interface PortResultBase<T extends string> extends PortRequestBase<T>
{
    /**
     * Whether this is the last reply to the message that was sent using the
     * mentioned rid.
     */
    done: boolean;
}

/** Contains an error encountered in a request. */
export interface PortResultError extends PortResultBase<"error">
{
    /** @override */
    done: true;
    /** The exception that was thrown by the port. */
    err: Error;
}

/** Contains an unprocessed error encountered in a request. */
export interface RawPortResultError extends Omit<PortResultError, "err">
{
    /** a Buffer containing the serialized Error object. */
    err: Buffer;
}

/** Helper for extracting the message type from a PortRequestMap type. */
type TMessage<TMap extends PortRequestMap<string>,
    T extends keyof TMap = keyof TMap> = TMap[T]["message"];

/**
 * Helper for extracting the result type from a PortRequestMap type. Also
 * includes an error type.
 */
type TResult<TMap extends PortRequestMap<string>,
        T extends keyof TMap = keyof TMap> =
    TMap[T]["result"] | PortResultError;

/**
 * Unprocessed port result.
 *
 * Helper for extracting the result type from a PortRequestMap type. Also
 * includes an error type.
 */
type TRawResult<TMap extends PortRequestMap<string>,
        T extends keyof TMap = keyof TMap> =
    TMap[T]["result"] | RawPortResultError;

/**
 * Interface for objects that work like `worker_threads` ports. This works for
 * the MessagePort and Worker types from that module.
 */
export interface PortLike
{
    on(event: "message", listener: (value: any) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    postMessage(value: any, transferList?: object[]): void;
}

/** Function type for `AsyncPort#postMessage()` callbacks. */
export type AsyncPortCallback<TMap extends PortRequestMap<string>> =
    (result: TResult<TMap>) => void;

/**
 * Manages a message-passing protocol between threads via ports. This protocol
 * involves passing messages (via the `PortMessageBase` interface) to a thread,
 * and receiving a result (via the `PortResultBase` interface) back from that
 * thread. This class handles the sending and receiving part of this exchange.
 */
export abstract class AsyncPort<TMap extends PortRequestMap<string>,
    TPort extends PortLike>
{
    /** Counter for assigning request ids. */
    private ridCounter = 0;
    /** Tracks current outgoing requests to the port. */
    private readonly requests:
        Map<number, (result: TResult<TMap>) => void> = new Map();

    /**
     * Creates an AsyncPort.
     * @param port Port to interface with.
     */
    constructor(protected readonly port: TPort)
    {
        port.on("message", (result: TRawResult<TMap>) =>
        {
            // find a registered callback
            const callback = this.requests.get(result.rid);
            if (!callback) throw new Error(`Invalid rid ${result.rid}`);

            // de-register
            if (result.done) this.requests.delete(result.rid);

            // process raw port result
            if (result.type === "error")
            {
                callback(
                {
                    ...result,
                    // workers pass serialized Error objects
                    err: deserialize((result as RawPortResultError).err)
                });
            }
            else callback(result);
        })
        .on("error", err =>
        {
            // make sure all pending callbacks get resolved
            const requests = [...this.requests];
            this.requests.clear();
            for (const [rid, callback] of requests)
            {
                callback({type: "error", rid, done: true, err});
            }
        });
    }

    /**
     * Closes the port. This has to be called at the end or the process will
     * hang.
     */
    public abstract close(): Promise<void>;

    /**
     * Sends and tracks a message through the port.
     * @param msg Message to send. Should have a unique RID attached.
     * @param transferList Port/buffer transfer list.
     * @param callback Function to call when a reply is sent by the port. This
     * may be called multiple times until the `done` property of the argument is
     * true.
     */
    protected postMessage<T extends keyof TMap>(msg: TMessage<TMap, T>,
        transferList: (MessagePort | ArrayBuffer)[],
        callback: (result: TResult<TMap, T>) => void): void
    {
        // should never happen
        if (this.requests.has(msg.rid))
        {
            throw new Error(`Duplicate rid ${msg.rid}`);
        }

        this.requests.set(msg.rid, (result: TResult<TMap>) =>
        {
            // should never happen
            if (msg.rid !== result.rid)
            {
                throw new Error(`Dispatched rid ${msg.rid} but got ` +
                    `${result.rid} back`);
            }

            // should never happen
            if (msg.type !== result.type && result.type !== "error")
            {
                throw new Error(`Message '${msg.type}' sent but got ` +
                    `'${result.type}' back`);
            }

            callback(result as TResult<TMap, T>);
        });
        this.port.postMessage(msg, transferList);
    }

    /** Generates a unique request id. */
    protected generateRID(): number
    {
        return this.ridCounter++;
    }
}
