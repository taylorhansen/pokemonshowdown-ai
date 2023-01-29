import * as tf from "@tensorflow/tfjs";
import {encodedStateToTensors, verifyModel} from "../../../../model/model";
import {BattleAgent} from "../agent";
import {allocEncodedState, encodeState} from "./encoder";
import {maxAgent} from "./maxAgent";

/** Contains the tensors used by the neural network. */
export type NetworkData = {
    /** State inputs as column vectors (for the batch dimension). */
    state: tf.Tensor[];
    /** Q-value outputs. */
    output: tf.Tensor1D;
};

/**
 * Creates a BattleAgent (via {@link policyAgent}) that uses a neural network
 * model for choice selection.
 *
 * @param model The neural network.
 * @param callback Optional. Observes the tensor inputs and outputs of the
 * neural network. This function will own the tensors, so it should take care of
 * disposing them.
 * @param debugRankings If true, the returned BattleAgent will also return a
 * debug string displaying the rankings for each choice.
 * @throws Error if the given model does not have the right input and output
 * shapes.
 */
export function networkAgent(
    model: tf.LayersModel,
    callback: (data: NetworkData) => void = tf.dispose,
    debugRankings?: boolean,
): BattleAgent<string | undefined> {
    verifyModel(model);
    return maxAgent(async function (state) {
        const stateData = allocEncodedState();
        encodeState(stateData, state);
        const stateTensors = encodedStateToTensors(
            stateData,
            true /*includeBatchDim*/,
        );

        const outputTensor = tf.tidy(() =>
            (model.predict(stateTensors) as tf.Tensor).as1D(),
        );
        const outputData = await outputTensor.data<"float32">();
        callback({state: stateTensors, output: outputTensor});
        return outputData;
    }, debugRankings);
}
