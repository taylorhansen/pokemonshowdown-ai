import {clearTimeout, setTimeout} from "timers";

/**
 * Wraps a Promise in a timeout.
 *
 * @param p Function returning the Promise to wrap.
 * @param ms Timeout in milliseconds.
 * @returns A wrapped Promise that will await `p` until the timeout, after which
 * the promise is rejected.
 */
export async function wrapTimeout<T>(
    p: () => Promise<T>,
    ms: number,
): Promise<T> {
    let timeoutRes: () => void;
    const timeoutPromise = new Promise<void>(res => (timeoutRes = res));
    const timeout = setTimeout(() => timeoutRes(), ms);
    return await Promise.race([
        p().finally(() => clearTimeout(timeout)),
        timeoutPromise.then(() => {
            throw new Error(`Timeout exceeded: ${ms}ms`);
        }),
    ]);
}
