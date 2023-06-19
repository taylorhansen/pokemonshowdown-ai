import {setTimeout} from "timers";

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
    return await new Promise<T>((res, rej) => {
        const timer = setTimeout(
            () => rej(new Error(`Timeout exceeded: ${ms}ms`)),
            ms,
        );
        void p()
            .then(value => res(value))
            .catch(reason => rej(reason))
            .finally(() => clearTimeout(timer));
    });
}
