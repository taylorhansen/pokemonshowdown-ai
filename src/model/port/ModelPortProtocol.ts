/** @file Defines the protocol typings for ModelPorts. */
import {
    PortProtocol,
    PortRequestBase,
    PortResultBase,
} from "../../util/port/PortProtocol";

/** ModelPort request protocol typings. */
export interface ModelPortProtocol
    extends PortProtocol<"predict" | "finalize"> {
    predict: {message: PredictMessage; result: PredictWorkerResult};
    finalize: {message: FinalizeMessage; result: FinalizeResult};
}

/** The types of requests that can be made to the model port. */
export type ModelPortRequestType = keyof ModelPortProtocol;

/** Types of messages that the ModelPort can send. */
export type ModelPortMessage =
    ModelPortProtocol[ModelPortRequestType]["message"];

/** Base interface for the predict request protocol. */
type PredictRequestBase<T extends ModelPortRequestType> = PortRequestBase<T>;

/** Prediction request message format. */
export interface PredictMessage extends PredictRequestBase<"predict"> {
    /** State data. */
    state: Float32Array[];
    /** Id of the previous action. Used for experience generation. */
    lastAction?: number;
    /** Reward from the state transition. Used for experience generation. */
    reward?: number;
}

/** Finalizes experience generation for the current game. */
export interface FinalizeMessage extends PredictRequestBase<"finalize"> {
    /** Data representing the final state. Omit to use previous state. */
    state?: Float32Array[];
    /** Id of the previous action. Omit to use the previous action. */
    lastAction?: number;
    /** Reward from game end. Omit to use the previous reward */
    reward?: number;
}

/** Types of results that can be given to the ModelPort. */
export type ModelPortResult = ModelPortProtocol[ModelPortRequestType]["result"];

/** Prediction returned from the model. */
export interface PredictWorkerResult
    extends PortResultBase<"predict">,
        PredictResult {
    /** @override */
    done: true;
}

/** Result from a prediction. */
export interface PredictResult {
    /** Action output. */
    output: Float32Array;
}

/** Result from finalizing a game. */
export interface FinalizeResult extends PortResultBase<"finalize"> {
    /** @override */
    done: true;
}
