/** @file Defines the base protocol typings for AsyncPorts. */

/**
 * Base type for AsyncPort request protocol typings.
 *
 * @template T String union of request types.
 */
export type PortProtocol<T extends string> = {
    [U in T]: {message: PortMessageBase<U>; result: PortResultBase<U>};
};

/** Base interface for {@link PortProtocol} messages and results. */
export interface PortRequestBase<T extends string> {
    /** Request type. */
    type: T;
    /** Request id. */
    rid: number;
}

/** Base interface for port messages. */
export type PortMessageBase<T extends string> = PortRequestBase<T>;

/** Base interface for port responses. */
export interface PortResultBase<T extends string> extends PortRequestBase<T> {
    /**
     * Whether this is the last reply to the message that was sent using the
     * mentioned rid.
     *
     * If false, another message of the same {@link type} (or `"error"`) and
     * {@link rid} can be expected.
     */
    done: boolean;
}

/** Contains an error encountered in a request. */
export interface PortResultError extends PortResultBase<"error"> {
    /** @override */
    done: true;
    /** Exception that was thrown by the port. */
    err: Error;
}

/** Contains an unprocessed error encountered in a request. */
export interface RawPortResultError extends Omit<PortResultError, "err"> {
    /** Contains the serialized Error object. */
    err: Buffer;
}
