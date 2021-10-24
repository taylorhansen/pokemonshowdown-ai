import {BattleAgent} from "../../../psbot/handlers/battle/agent";
import {FormatType} from "../../../psbot/handlers/battle/formats";
import {PredictResult} from "../../model/worker/ModelPortProtocol";

/** BattleAgent decision data. */
export interface ExperienceAgentData extends PredictResult {
    /** State in which the action was taken. */
    state: Float32Array;
}

/** BattleAgent type that emits partial Experience objects. */
export type ExperienceAgent<T extends FormatType = FormatType> = BattleAgent<
    T,
    ExperienceAgentData
>;

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
