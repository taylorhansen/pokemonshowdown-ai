/** Preprocessed network decision evaluation data. */
export interface Experience
{
    /** State in which the action was taken. */
    state: readonly number[];
    /** ID of the Choice that was taken. */
    action: number;
    /** Reward gained from the action. */
    reward: number;
    /** Next state after taking the action. */
    nextState: readonly number[];
    /** ID of the best action that will be taken in the next state. */
    nextAction: number;
}
