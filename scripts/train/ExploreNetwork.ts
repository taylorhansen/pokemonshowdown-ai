import * as tf from "@tensorflow/tfjs-node";
import { Network } from "../../src/ai/Network";
import { Choice } from "../../src/battle/agent/Choice";
import { ReadonlyBattleState } from "../../src/battle/state/BattleState";
import { shuffle } from "./shuffle";
import { ExploreOptions } from "./train";

/**
 * Network with an epsilon-greedy policy over the usual behavior. The
 * probability that this Network will randomly decide (explore) rather than use
 * the neural network (exploit) exponentially decays over subsequent `#decide()`
 * calls.
 */
export class ExploreNetwork extends Network
{
    /** Current explore probability. */
    private exploreProb: number;
    /** Minimum explore probability. */
    private readonly exploreStop: number;
    /** Decay factor for calculating the next explore probability. */
    private readonly decayFactor: number;

    /**
     * Creates an ExploreNetwork.
     * @param model Neural network model for making decisions.
     * @param explore Options for epsilon-greedy policy.
     */
    constructor(model: tf.LayersModel, options: ExploreOptions)
    {
        super(model);

        let start = Math.min(1, options.start);
        let stop = Math.max(0, options.stop);
        start = Math.max(start, stop);
        stop = Math.min(stop, start);
        const decay = Math.max(0, Math.min(options.decay, 1));

        this.exploreProb = start;
        this.exploreStop = stop;
        this.decayFactor = Math.exp(-decay);
    }

    /** @override */
    public async decide(state: ReadonlyBattleState, choices: Choice[]):
        Promise<void>
    {
        // recursively calculate explore probability through exponential decay
        this.exploreProb = this.exploreStop +
            (this.exploreProb - this.exploreStop) * this.decayFactor;

        if (Math.random() < this.exploreProb)
        {
            // explore
            shuffle(choices);
        }
        // exploit
        else return super.decide(state, choices);
    }
}
