import { Choice } from "./Choice";

/** Decides what to do in a battle. */
export interface AI
{
    /**
     * Decides what to do next.
     * @param state Current state of the battle.
     * @param choices The set of possible choices that can be made.
     * @param reward Reward accumulated from the last action.
     * @returns A Promise to compute the command to be sent, e.g. `move 1` or
     * `switch 3`.
     */
    decide(state: number[], choices: Choice[], reward?: number):
        Promise<Choice>;

    /** Saves AI state to storage. */
    save(): Promise<void>;
}

/** Interface for the constructor of an AI object. */
export interface AIConstructor
{
    /**
     * Constructor function.
     * @param inputLength Expected length of state input.
     */
    new(inputLength: number): AI;
}
