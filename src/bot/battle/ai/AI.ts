import { Choice } from "./Choice";

/** Decides what to do in a battle. */
export interface AI
{
    /**
     * Decides what to do next.
     * @param state Current state of the battle.
     * @param choices The set of possible choices that can be made.
     * @returns A command to be sent, e.g. `move 1` or `switch 3`.
     */
    decide(state: number[], choices: Choice[]): Choice;
}

/** Interface for the constructor of an AI object. */
export interface AIConstructor
{
    new(): AI;
}
