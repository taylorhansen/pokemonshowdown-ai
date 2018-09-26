/** The types of choices that can be made by the user. */
export type Choice = keyof typeof choiceIdsInternal;

const choiceIdsInternal =
{
    "move 1": 0, "move 2": 1, "move 3": 2, "move 4": 3, "switch 2": 4,
    "switch 3": 5, "switch 4": 6, "switch 5": 7, "switch 6": 8
};

/** Maps a choice name to its id number. */
export const choiceIds: Readonly<typeof choiceIdsInternal> = choiceIdsInternal;

/** Maps a choice id number to its name. */
export const intToChoice: ReadonlyArray<Choice> = (function()
{
    const result: Choice[] = [];
    Object.keys(choiceIds).forEach((choice: Choice, i) => result[i] = choice);
    return result;
})();
