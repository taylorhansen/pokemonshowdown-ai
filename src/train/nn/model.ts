import * as tf from "@tensorflow/tfjs";
import { battleStateEncoder } from "../../ai/encoder/encoders";
import { intToChoice } from "../../battle/agent/Choice";

/** Creates a model for training. */
export function createModel(): tf.LayersModel
{
    // initial layer
    const state = tf.layers.input(
        {name: "network/state", shape: [battleStateEncoder.size]});
    const fc1 = tf.layers.dense(
    {
        name: "network/fc1", units: 1000, activation: "relu",
        kernelInitializer: "heNormal", biasInitializer: "heNormal"
    }).apply(state);

    // action-prob and state-value outputs
    const actionProbs = tf.layers.dense(
    {
        name: "network/action-probs", units: intToChoice.length,
        activation: "softmax", kernelInitializer: "heNormal",
        biasInitializer: "heNormal"
    }).apply(fc1) as tf.SymbolicTensor;
    const stateValue = tf.layers.dense(
    {
        // training reward is max -1 to 1, so output should be bounded by it
        name: "network/state-value", units: 1, activation: "tanh",
        kernelInitializer: "heNormal", biasInitializer: "heNormal"
    }).apply(fc1) as tf.SymbolicTensor;

    return tf.model(
        {name: "network", inputs: state, outputs: [actionProbs, stateValue]});
}
