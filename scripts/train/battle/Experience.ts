/** Preprocessed network decision evaluation data. */
export interface Experience
{
    /** State in which the action was taken. */
    state: number[];
    /** ID of the Choice that was taken. */
    action: number;
    /** Reward gained from the action. */
    reward: number;
    /** Next state after taking the action. */
    nextState: number[];
}
