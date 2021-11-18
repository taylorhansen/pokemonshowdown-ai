/**
 * Executes a callback after a timer with nanosecond support using Node's
 * high-res timer.
 *
 * @param callback Function to call.
 * @param ns Amount of time to wait in ns.
 * @returns A function that will cancel the timer and immediately call the
 * callback.
 */
export function setTimeoutNs(
    callback: (canceled: boolean) => void,
    ns: bigint,
): () => void {
    const timerState: TimerState = {
        callback,
        ns,
        start: process.hrtime.bigint(),
        timeLeft: ns,
        canceled: false,
    };
    dispatchTimer(timerState);
    return () => {
        timerState.canceled = true;
        callback(true /*canceled*/);
    };
}

/** 1ms in ns. */
const oneMs = 1000000n;
/**
 * Threshold for time left until we start using `setImmediate` instead of
 * `setTimeout`.
 */
const timeoutThreshold = 10000000n; /*10ms*/

/** Timer state. */
interface TimerState {
    /** Function to call when expired. */
    readonly callback: (canceled: boolean) => void;
    /** Requested timer duration in ns. */
    readonly ns: bigint;
    /** Initial `process.hrtime.bigint()` call. */
    readonly start: bigint;
    /** Remaining time until done. */
    timeLeft: bigint;
    /** Whether the timer has finished or has been canceled. */
    canceled: boolean;
}

/** Dispatches a timer to check the time after it's done. */
function dispatchTimer(timerState: TimerState) {
    if (timerState.timeLeft > timeoutThreshold) {
        // Use regular ms timeout until we need more precision.
        // Take 5ms off to avoid overshooting it.
        setTimeout(
            checkTimer,
            Number(timerState.timeLeft / oneMs) - 5,
            timerState,
        );
    }
    // Check as often as possible for the last 10ms.
    else setImmediate(checkTimer, timerState);
}

/** Checks the time left on the timer or otherwise restarts the timer. */
function checkTimer(timerState: TimerState) {
    if (timerState.canceled) return;

    // See if we crossed the threshold.
    const timestamp = process.hrtime.bigint();
    const elapsed = timestamp - timerState.start;
    timerState.timeLeft = timerState.ns - elapsed;
    if (timerState.timeLeft <= 0n) {
        timerState.callback(false /*canceled*/);
        return;
    }

    // Otherwise restart the timer.
    dispatchTimer(timerState);
}
