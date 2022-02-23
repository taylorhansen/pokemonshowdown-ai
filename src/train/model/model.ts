import * as tf from "@tensorflow/tfjs";
import {intToChoice} from "../../psbot/handlers/battle/agent";
import {battleStateEncoder} from "../../psbot/handlers/battle/ai/encoder/encoders";

/** Creates a model for training. */
export function createModel(): tf.LayersModel {
    // Input layer.
    const state = tf.layers.input({
        name: "network/state",
        shape: [battleStateEncoder.size],
    });
    // Shared layer.
    const fc1 = tf.layers
        .dense({
            name: "network/fc1",
            units: 1024,
            activation: "tanh",
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
        })
        .apply(state);

    // Action-prob and state-value outputs.
    const actionProbs = tf.layers
        .dense({
            name: "network/action-probs",
            units: intToChoice.length,
            activation: "softmax",
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
        })
        .apply(fc1) as tf.SymbolicTensor;
    const stateValue = tf.layers
        .dense({
            name: "network/state-value",
            units: 1,
            // Total reward is between [-1, 1], so value func should be bounded
            // by it via tanh activation.
            activation: "tanh",
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
        })
        .apply(fc1) as tf.SymbolicTensor;

    return tf.model({
        name: "network",
        inputs: state,
        outputs: [actionProbs, stateValue],
    });
}
