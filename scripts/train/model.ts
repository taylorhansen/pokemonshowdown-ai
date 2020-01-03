import * as tf from "@tensorflow/tfjs-node";
import { sizeBattleState } from "../../src/ai/encodeBattleState";
import { intToChoice } from "../../src/battle/agent/Choice";

/** Creates a model for training. */
export function createModel(): tf.LayersModel
{
    return tf.sequential(
    {
        name: "q-value",
        layers:
        [
            tf.layers.inputLayer(
                {name: "q-value/state", inputShape: [sizeBattleState]}),
            tf.layers.dense(
                {name: "q-value/fc1", units: 1000, activation: "elu"}),
            tf.layers.dropout({name: "q-value/dropout1", rate: 0.3}),
            tf.layers.dense(
            {
                name: "q-value/out", units: intToChoice.length,
                activation: "linear"
            })
        ]
    });
}
