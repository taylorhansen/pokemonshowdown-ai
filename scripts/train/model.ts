/** @file Neural network model config. */
import * as tf from "@tensorflow/tfjs-node";
import { sizeBattleState } from "../../src/ai/encodeBattleState";
import { intToChoice } from "../../src/battle/agent/Choice";

/** Creates a model for training. */
export function createModel(): tf.LayersModel
{
    const model = tf.sequential();
    model.add(tf.layers.dense(
        {inputShape: [sizeBattleState], units: 20000, activation: "elu"}));
    model.add(tf.layers.dropout({rate: 0.3}));
    model.add(tf.layers.dense({units: 1000, activation: "elu"}));
    model.add(tf.layers.dropout({rate: 0.3}));
    model.add(tf.layers.dense(
        {units: intToChoice.length, activation: "linear"}));
    return model;
}

/** Compiles a model so it can be trained. */
export function compileModel(model: tf.LayersModel): void
{
    model.compile(
        {loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]});
}
