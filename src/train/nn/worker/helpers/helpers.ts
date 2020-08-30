/**
 * Executes a callback after a timer. Uses Node's high-res timer
 * `process.hrtime()`.
 * @param callback Function to call.
 * @param ns Amount of time to wait in ns. Can't go over 1 second.
 * @returns A function that will cancel the timer and immediately call the
 * callback.
 */
export function setTimeoutNs(callback: () => void, ns: number): () => void
{
    ns = Math.min(999999999, ns);

    const timerState = {done: false}
    dispatchTimeout(setTimeoutNsImpl, ns, callback, ns, process.hrtime(),
        timerState);
    return function() { timerState.done = true; };
}

function dispatchTimeout(callback: (...args: any[]) => any, ns: number,
    ...args: any[]): void
{
    // choose timer type based one time
    if (ns > /*10ms*/10000000)
    {
        // use js timeout until we need more precision
        // take 5ms off since the js timer can often go over
        setTimeout(callback, ns / 1000000 - 5, ...args);
    }
    // check as often as possible for the last 10ms
    else setImmediate(callback, ...args);
}

function setTimeoutNsImpl(callback: () => void, ns: number,
    start: [number, number], timerState: {done: boolean}): void
{
    if (timerState.done)
    {
        callback();
        return;
    }

    // see if we crossed the threshold
    const diff = process.hrtime(start);
    if (diff[0] > 0 || diff[1] >= ns)
    {
        callback();
        return;
    }

    dispatchTimeout(setTimeoutNsImpl, ns - diff[1], callback, ns, start,
        timerState);
}
