import {Choice} from "../../../psbot/handlers/battle/agent";
import {ExperienceBattleAgent} from "../../experience";
import {AgentExploreConfig} from "./GameProtocol";

/**
 * Callback for processing partial experience data from a
 * {@link GameModel.getAgent GameModel BattleAgent}.
 *
 * @param state Resultant encoded state vector.
 * @param choices Available choices from this state.
 * @param action Previous action that led to this state.
 * @param reward Reward from the last state transition.
 */
export type AgentExperienceCallback = (
    state: readonly Float32Array[],
    choices: readonly Choice[],
    action?: number,
    reward?: number,
) => Promise<void>;

export type GameModelType = "artifact" | "port";

/** Object that manages a model from within a game worker. */
export interface GameModel<T extends GameModelType = GameModelType> {
    /** Type of model. */
    readonly type: T;

    /**
     * Creates a BattleAgent from the registered model suitable for inference
     * during games.
     *
     * @param explore Config for random exploration.
     * @param expCallback Callback for handling generated experience data.
     * @param debugRankings If true, the returned BattleAgent will also return a
     * debug string displaying the value of each choice.
     */
    getAgent: (
        explore?: AgentExploreConfig,
        expCallback?: AgentExperienceCallback,
        debugRankings?: boolean,
    ) => ExperienceBattleAgent;

    /** Destroys this model. */
    destroy: () => void;
}
