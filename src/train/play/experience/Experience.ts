import {BattleAgent} from "../../../psbot/handlers/battle/agent";

/** BattleAgent decision data. */
export interface ExperienceAgentData {
    /** State in which the action was taken. Flattened array data. */
    state: Float32Array[];
}

/** BattleAgent type that emits partial Experience objects. */
export type ExperienceAgent = BattleAgent<ExperienceAgentData>;

/**
 * BattleAgent decision evaluation data. Can be processed in batches to
 * effectively train a neural network.
 */
export interface Experience extends ExperienceAgentData {
    /** ID of the Choice that was taken. */
    action: number;
    /** Reward gained from the action and state transition. */
    reward: number;
}
