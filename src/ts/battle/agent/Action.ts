// TODO: Make this into a proper enum?
/** Maps a action name to its id number. */
export const actionIds = {
    /* eslint-disable @typescript-eslint/naming-convention */
    "move 1": 0,
    "move 2": 1,
    "move 3": 2,
    "move 4": 3,
    "switch 2": 4,
    "switch 3": 5,
    "switch 4": 6,
    "switch 5": 7,
    "switch 6": 8,
    /* eslint-enable @typescript-eslint/naming-convention */
} as const;

/** The types of actions that can be made by the user. */
export type Action = keyof typeof actionIds;

/**
 * Array of all possible actions. Effectively maps an action id from
 * {@link actionIds} back to its string identifier.
 */
export const actions: readonly Action[] = (function () {
    const result: Action[] = [];
    (Object.keys(actionIds) as Action[]).forEach(
        (action, i) => (result[i] = action),
    );
    return result;
})();
