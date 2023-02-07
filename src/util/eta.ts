/**
 * Estimates the ETA of a progress bar.
 *
 * @param start Start time.
 * @param now Current time.
 * @param curr Current progress ticks.
 * @param total Max progress ticks.
 * @returns Estimated remaining time to complete progress bar.
 */
export function estimateEta(
    start: number,
    now: number,
    curr: number,
    total: number,
): number {
    return curr >= total ? 0 : (now - start) * (total / curr - 1);
}
