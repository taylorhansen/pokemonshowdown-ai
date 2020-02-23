import * as tf from "@tensorflow/tfjs-node";
import { sizeBattleState } from "../../src/ai/encodeBattleState";
import { NetworkAgent } from "../../src/ai/NetworkAgent";

/** Network that logs its inputs and outputs. */
export class ExperienceNetwork extends NetworkAgent
{
    // fields for putting into Experience tuples
    /**
     * State tensor that was used in the last `#decide()` call. The next
     * `#decide()` call will dispose this tensor so set it to null if you want
     * to extract it for another purpose.
     */
    public lastState: tf.Tensor | null = null;
    /** Logits tensor that was calculated from the last `#decide()`. */
    public lastLogits: tf.Tensor | null = null;
    /** State-value function that was estimated from the last `#decide()`. */
    public lastValue: tf.Scalar | null = null;

    /** Disposes tensor fields that aren't set to null. */
    public cleanup(): void
    {
        // make sure unconsumed fields get disposed
        this.lastState?.dispose();
        this.lastLogits?.dispose();
        this.lastValue?.dispose();
    }

    /** @override */
    protected getLogits(state: number[]): tf.Tensor1D
    {
        return tf.tidy(() =>
        {
            const stateTensor = tf.tensor(state);
            const [logits, value] =
                this.model.predict(stateTensor.reshape([1, sizeBattleState])) as
                    tf.Tensor[];
            const squeezedLogits = logits.squeeze().as1D();

            this.cleanup();
            this.lastState = tf.keep(stateTensor);
            this.lastLogits = tf.keep(squeezedLogits.clone());
            this.lastValue = tf.keep(value.squeeze().asScalar());

            return squeezedLogits;
        });
    }
}
