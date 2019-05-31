/** @file Helper functions for BattleState classes. */

// istanbul ignore next: only used in logging
/**
 * Pluralizes the word "turns". E.g. `pluralTurns("tox", 1)` returns
 * `"tox for 1 turn"`.
 * @param name Name of status.
 * @param turns Number of turns.
 * @param limit Max number of turns.
 */
export function pluralTurns(name: string, turns: number, limit?: number): string
{
    return `${name} for ${turns}${limit ? `/${limit}` : ""} \
turn${turns !== 1 ? "s" : ""}`;
}
