import * as tf from "@tensorflow/tfjs";
import { formats } from "../../psbot/handlers/battle";
import { intToChoice } from "../../psbot/handlers/battle/agent";

/**
 * Creates a model for training.
 * @param format Game format type.
 */
export function createModel(format: formats.FormatType): tf.LayersModel
{
    const state = tf.layers.input(
        {name: "network/state", shape: [formats.encoder[format].size]});
    // shared layer
    const fc1 = tf.layers.dense(
    {
        name: "network/fc1", units: 1024, activation: "tanh",
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
        // total reward is [-1, 1], so value func should be bounded by it
        name: "network/state-value", units: 1, activation: "tanh",
        kernelInitializer: "heNormal", biasInitializer: "heNormal"
    }).apply(fc1) as tf.SymbolicTensor;

    return tf.model(
        {name: "network", inputs: state, outputs: [actionProbs, stateValue]});
}
