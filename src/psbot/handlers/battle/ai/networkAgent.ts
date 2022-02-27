import * as tf from "@tensorflow/tfjs";
import {modelInputShapes, verifyModel} from "../../../../train/model/shapes";
import {BattleAgent} from "../agent";
import {allocEncodedState, encodeState} from "./encoder";
import {policyAgent, PolicyType} from "./policyAgent";

/** Contains the tensors used by the neural network. */
export type NetworkData = {
    /** State inputs as column vectors for the batch dimension. */
    state: tf.Tensor[];
    /** Action-probability outputs. */
    probs: tf.Tensor1D;
    /** State-value output. */
    value: tf.Scalar;
};

/**
 * Creates a BattleAgent (via {@link policyAgent}) that uses a neural network
 * for choice selection.
 *
 * @param model The neural network.
 * @param policy Action selection method. See {@link policyAgent} for details.
 * @param callback Optional. Observes the tensor inputs and outputs of the
 * neural network. This function will own the tensors, so it should take care of
 * disposing them.
 * @throws Error if the given model does not have the right input and output
 * shapes.
 */
export function networkAgent(
    model: tf.LayersModel,
    policy: PolicyType,
    callback: (data: NetworkData) => void = tf.dispose,
): BattleAgent<void> {
    verifyModel(model);
    return policyAgent(async function (state) {
        const stateData = allocEncodedState();
        encodeState(stateData, state);
        const stateTensors = encodedStateToTensors(
            stateData,
            true /*batchDim*/,
        );

        const [probsTensor, valueTensor] = tf.tidy(function () {
            const [actProbs, stateValue] = model.predict(
                stateTensors,
            ) as tf.Tensor[];
            return [actProbs.as1D(), stateValue.asScalar()];
        });
        const probsData = (await probsTensor.data()) as Float32Array;
        callback({state: stateTensors, probs: probsTensor, value: valueTensor});
        return probsData;
    }, policy);
}

/**
 * Converts the data lists into tensors
 *
 * @param batchDim Whether to add an extra 1 dimension for the batch. Default
 * false.
 */
export function encodedStateToTensors(
    arr: Float32Array[],
    batchDim?: boolean,
): tf.Tensor[] {
    if (arr.length !== modelInputShapes.length) {
        throw new Error(
            `Expected ${modelInputShapes.length} inputs but found ` +
                `${arr.length}`,
        );
    }
    return modelInputShapes.map((shape, i) =>
        tf.tensor(arr[i], batchDim ? [1, ...shape] : [...shape], "float32"),
    );
}
