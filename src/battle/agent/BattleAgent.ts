import { BattleState } from "../state/BattleState";
import { Pokemon } from "../state/Pokemon";
import { Choice } from "./Choice";

/** Type for constructing BattleAgents. */
export type BattleAgentCtor = new() => BattleAgent;

/**
 * Makes decisions in a battle. Can be reused for multiple battles of the same
 * format.
 */
export interface BattleAgent
{
    /** Tells the BattleAgent which of its ranked choices was accepted. */
    acceptChoice(choice: Choice): void;

    /**
     * Decides which action should be taken.
     * @param state State to decide on.
     * @param choices Available choices to choose from.
     * @returns Each Choice sorted from most to least preferable.
     */
    decide(state: BattleState, choices: Choice[]): Promise<Choice[]>;

    /** Called when a pokemon faints. */
    onFaint?(mon: Pokemon): void;

    /** Called when a turn has passed. */
    onTurn?(): void;
}
