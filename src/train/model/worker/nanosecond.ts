/**
 * Executes a callback after a timer with nanosecond support using Node's
 * high-res timer.
 *
 * @param callback Function to call.
 * @param ns Amount of time to wait in ns.
 * @returns A function that will cancel the timer and immediately call the
 * callback.
 */
export function setTimeoutNs(callback: () => void, ns: bigint): () => void
{
    const timerState: TimerState =
    {
        callback, ns, start: process.hrtime.bigint(), timeLeft: ns,
        canceled: false
    };
    dispatchTimer(timerState);
    return () => { timerState.canceled = true; callback(); };
}

/** 1ms in ns. */
const oneMs = 1000000n;
/** 10ms in ns. */
const tenMs = 10000000n;

/** Timer state. */
interface TimerState
{
    /** Function to call when expired. */
    readonly callback: () => void;
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
function dispatchTimer(timerState: TimerState)
{
    if (timerState.timeLeft > tenMs)
    {
        // Use regular ms timeout until we need more precision.
        // Take 5ms off to avoid overshooting it.
        setTimeout(checkTimer, Number(timerState.timeLeft / oneMs) - 5,
            timerState);
    }
    // Check as often as possible for the last 10ms.
    else setImmediate(checkTimer, timerState);
}

/** Checks the time left on the timer or otherwise restarts the timer. */
function checkTimer(timerState: TimerState)
{
    if (timerState.canceled) return;

    // See if we crossed the threshold.
    timerState.timeLeft = process.hrtime.bigint() - timerState.start;
    if (timerState.timeLeft <= 0n)
    {
        timerState.callback();
        return;
    }

    // Otherwise restart the timer.
    dispatchTimer(timerState);
}
