import * as tf from "@tensorflow/tfjs";
import { BattleState } from "../state/BattleState";

/** Maps a decision number to an equivalent message. */
const decisions: string[] =
[
    "move 1", "move 2", "move 3", "move 4", "switch 2", "switch 3", "switch 4",
    "switch 5", "switch 6"
];

/** Neural network interface. */
export const network =
{
    /**
     * Runs the neural network to decide what to do next.
     * @param state Current state of the battle.
     * @returns A command to be sent, e.g. `move 1` or `switch 3`.
     */
    decide(state: BattleState): string
    {
        const input: number[] = state.toArray();

        const model = tf.sequential();
        model.add(tf.layers.dense(
        {
            units: 10, inputShape: [input.length], activation: "softmax"
        }));

        // run a single input vector through the nn
        const tensorOut = model.predict(
            tf.tensor([input], [1, input.length], "float32")) as tf.Tensor;

        // the index of the neuron with the highest activation decides what
        //  kind of message we're gonna send
        let decision = 0;
        const output = tensorOut.flatten().dataSync();
        for (let i = 1; i < output.length; ++i)
        {
            if (output[i] > output[decision])
            {
                decision = i;
            }
        }
        return decisions[decision];
    }
};
