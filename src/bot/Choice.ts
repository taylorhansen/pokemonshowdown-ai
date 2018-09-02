/** The types of choices that can be made by the user. */
export type Choice = "move 1" | "move 2" | "move 3" | "move 4" | "switch 2" |
    "switch 3" | "switch 4" | "switch 5" | "switch 6";

/** Maps a choice name to its id number. */
export const choiceIds: {[C in Choice]: number} =
{
    "move 1": 0, "move 2": 1, "move 3": 2, "move 4": 3, "switch 2": 4,
    "switch 3": 5, "switch 4": 6, "switch 5": 7, "switch 6": 8
};
