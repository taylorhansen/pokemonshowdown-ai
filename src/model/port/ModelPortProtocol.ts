/** @file Defines the protocol typings for ModelPorts. */
import {
    PortProtocol,
    PortRequestBase,
    PortResultBase,
} from "../../util/port/PortProtocol";

/** ModelPort request protocol typings. */
export interface ModelPortProtocol extends PortProtocol<"predict"> {
    predict: {message: PredictMessage; result: PredictWorkerResult};
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
