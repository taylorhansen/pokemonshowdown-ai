import {BattleAgent} from "../../psbot/handlers/battle/agent";

/**
 * BattleAgent decision evaluation data. Can be processed in batches to
 * effectively train a neural network.
 */
export interface Experience {
    /** State in which the action was taken. Flattened array data. */
    state: readonly Float32Array[];
    /** Id of the action that was taken. */
    action: number;
    /**
     * Reward (or n-step returns) gained from the action and state transition.
     */
    reward: number;
    /** Resultant state from action. */
    nextState: readonly Float32Array[];
    /** Binary choice legality data for the {@link nextState next state}. */
    choices: Uint8Array;
    /** Marks {@link nextState} as a terminal state so it won't be processed. */
    done: boolean;
}

/** BattleAgent with additional args for experience generation. */
export type ExperienceBattleAgent<TInfo = unknown> = BattleAgent<
    TInfo,
    [lastAction?: number, reward?: number]
>;
