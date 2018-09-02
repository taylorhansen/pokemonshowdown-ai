import * as tf from "@tensorflow/tfjs";
import { Choice, choiceIds } from "./Choice";
import { BattleState } from "./state/BattleState";

/** Neural network interface. */
export class Network
{
    /** Neural network model. */
    private readonly model = tf.sequential();
    private readonly inputLength = 264; // TODO

    /**
     * Creates a Network.
     * @param inputLength Amount of inputs to receive.
     */
    constructor()
    {
        // setup all the layers
        const outNeurons = Object.keys(choiceIds).length;
        this.model.add(tf.layers.dense(
        {
            units: outNeurons, inputShape: [this.inputLength],
            activation: "softmax"
        }));
    }

    /**
     * Runs the neural network to decide what to do next.
     * @param state Current state of the battle.
     * @param choices The set of possible choices that can be made.
     * @returns A command to be sent, e.g. `move 1` or `switch 3`.
     */
    public decide(state: BattleState, choices: Choice[]): string
    {
        const input: number[] = state.toArray();

        // run a single input vector through the neural network
        const tensorOut = this.model.predict(
            tf.tensor([input], [1, this.inputLength], "float32")) as tf.Tensor;
        const output = tensorOut.flatten().dataSync();

        // find the highest activation that is a subset of the choices array
        let bestChoice = choices[0];
        for (let i = 1; i < choices.length; ++i)
        {
            const choice = choices[i];
            const activation = output[choiceIds[choice]];
            if (activation > output[choiceIds[bestChoice]])
            {
                bestChoice = choice;
            }
        }
        return bestChoice;
    }
}
