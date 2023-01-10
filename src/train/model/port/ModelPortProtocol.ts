/** @file Defines the protocol typings for ModelPorts. */
import {
    PortProtocol,
    PortRequestBase,
    PortResultBase,
} from "../../port/PortProtocol";

/** ModelPort request protocol typings. */
export interface ModelPortProtocol extends PortProtocol<"predict"> {
    predict: {message: PredictMessage; result: PredictWorkerResult};
}

/** Base interface for the predict request protocol. */
type PredictRequestBase = PortRequestBase<"predict">;

/** Prediction request message format. */
export interface PredictMessage extends PredictRequestBase {
    /** State data. */
    state: Float32Array[];
}

/** Prediction returned from the model. */
export interface PredictWorkerResult
    extends PortResultBase<"predict">,
        PredictResult {
    /** @override */
    done: true;
}

/** Result from a prediction. */
export interface PredictResult {
    /** Given state input. */
    input: Float32Array[];
    /** Action output. */
    output: Float32Array;
}
