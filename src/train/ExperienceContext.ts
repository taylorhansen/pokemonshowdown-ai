import {ExperienceConfig} from "../config/types";
import {Experience} from "../game/experience";
import {intToChoice} from "../psbot/handlers/battle/agent";

/** Tracks Experience generation for one side of a game. */
export class ExperienceContext {
    /** Contains last `steps-1` states. */
    private readonly states: (readonly Float32Array[])[] = [];
    /** Contains last `steps-1` actions. */
    private readonly actions: number[] = [];
    /** Contains last `steps-1` rewards. */
    private readonly rewards: number[] = [];

    /** Most recent state. */
    private latestState: readonly Float32Array[] | null = null;

    /**
     * Creates an ExperienceContext.
     *
     * @param config Experience config.
     * @param callback Callback to emit experiences.
     */
    public constructor(
        private readonly config: ExperienceConfig,
        private readonly callback: (exp: Experience) => void,
    ) {}

    /**
     * Adds data for generating experience.
     *
     * @param state Resultant state.
     * @param choices Available choices for the new state.
     * @param action Action used to get to state.
     * @param reward Net reward from state transition.
     */
    public add(
        state: readonly Float32Array[],
        choices: Uint8Array,
        action?: number,
        reward?: number,
    ): void {
        if (!this.latestState) {
            // First decision doesn't have past action/reward yet.
            this.latestState = state;
            return;
        }

        if (action === undefined) {
            throw new Error(
                "Predict requests after first must include previous action",
            );
        }
        if (reward === undefined) {
            throw new Error(
                "Predict requests after first must include previous reward",
            );
        }

        this.states.push(this.latestState);
        this.latestState = state;
        this.actions.push(action);
        this.rewards.push(reward);

        if (this.states.length < this.config.steps) {
            return;
        }

        const lastState = this.states.shift()!;
        const lastAction = this.actions.shift()!;

        // Get n-step returns for current experience.
        let returns = this.rewards[this.rewards.length - 1];
        for (let i = this.rewards.length - 2; i >= 0; --i) {
            returns = this.rewards[i] + this.config.rewardDecay * returns;
        }
        this.rewards.shift();

        this.callback({
            state: lastState,
            action: lastAction,
            reward: returns,
            nextState: state,
            choices,
            done: false,
        });
    }

    /**
     * Generates the final experience for the game.
     *
     * @param state Final state. If omitted, no experience should be generated.
     * @param action Action before final state.
     * @param reward Final reward.
     */
    public finalize(
        state?: readonly Float32Array[],
        action?: number,
        reward?: number,
    ): void {
        if (!state) {
            // Game was forced to end abruptly.
            return;
        }

        if (!this.latestState) {
            throw new Error("No last state");
        }

        if (action === undefined) {
            throw new Error("No last action provided");
        }
        if (reward === undefined) {
            throw new Error("No last reward provided");
        }

        const exps: Experience[] = [
            {
                state: this.latestState,
                action,
                reward,
                nextState: state,
                // Note: Pre-filled with zeros.
                choices: new Uint8Array(intToChoice.length),
                done: true,
            },
        ];

        // Get up-to-n-step returns for remaining buffered experiences.
        let returns = reward;
        while (this.states.length > 0) {
            const lastState = this.states.pop()!;
            const lastAction = this.actions.pop()!;
            const lastReward = this.rewards.pop()!;
            returns = lastReward + this.config.rewardDecay * returns;

            exps.push({
                state: lastState,
                action: lastAction,
                reward: returns,
                nextState: state,
                choices: new Uint8Array(intToChoice.length),
                done: true,
            });
        }

        // Preserve experience order.
        while (exps.length > 0) {
            this.callback(exps.pop()!);
        }
    }
}
