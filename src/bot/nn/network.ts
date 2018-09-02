import * as tf from "@tensorflow/tfjs";
import { Choice, choiceIds } from "../Choice";
import { BattleState } from "../state/BattleState";

/** Neural network interface. */
export const network =
{
    /**
     * Runs the neural network to decide what to do next.
     * @param state Current state of the battle.
     * @param choices The set of possible choices that can be made.
     * @returns A command to be sent, e.g. `move 1` or `switch 3`.
     */
    decide(state: BattleState, choices: Choice[]): string
    {
        const input: number[] = state.toArray();

        const model = tf.sequential();
        model.add(tf.layers.dense(
        {
            units: 9, inputShape: [input.length], activation: "softmax"
        }));

        // run a single input vector through the nn
        const tensorOut = model.predict(
            tf.tensor([input], [1, input.length], "float32")) as tf.Tensor;
        const output = tensorOut.flatten().dataSync();

        // find the highest activation that is a subset of the choices array
        let bestChoice = 0;
        for (let i = 1; i < choices.length; ++i)
        {
            const activation = output[choiceIds[choices[i]]];
            if (activation > output[choiceIds[choices[bestChoice]]])
            {
                bestChoice = i;
            }
        }
        return choices[bestChoice];
    }
};
