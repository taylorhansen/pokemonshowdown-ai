/** Preprocessed network decision evaluation data. */
export interface Decision
{
    /** State in which the action was taken. */
    state: number[];
    /** Expected Q-values for each Choice id. */
    target: number[];
}
