import {Transform, TransformCallback} from "stream";
import {GamePool, GamePoolArgs} from "./GamePool";

/**
 * Pipes game configs through a thread pool to generate game results.
 *
 * Wraps {@link GamePool.add} into a Transform stream. Results order may be
 * nondeterministic due to worker scheduling.
 */
export class GamePoolStream extends Transform {
    /** Keeps track of currently running games. */
    private readonly gamePromises = new Set<Promise<void>>();

    /**
     * Creates a GamePoolStream.
     *
     * @param pool GamePool to wrap. This object should own `pool` until it gets
     * destroyed.
     */
    public constructor(private readonly pool: GamePool) {
        super({objectMode: true, highWaterMark: pool.numThreads});
    }

    public override _transform(
        args: GamePoolArgs,
        encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        // Queue a game, passing errors and queueing the next one once a port
        // has been assigned.
        const gamePromise = (async () => {
            try {
                this.push(await this.pool.add(args, callback));
            } catch (err) {
                // Generally add() should swallow/wrap errors, but if anything
                // happens outside of that then the stream should crash.
                this.emit("error", err);
            }
        })();
        this.gamePromises.add(gamePromise);

        // Cleanup after the game to keep the Set from getting too big.
        gamePromise.finally(() => this.gamePromises.delete(gamePromise));
    }

    public override _flush(callback: TransformCallback): void {
        // Wait for all queued games to finish, then the stream can safely
        // close.
        void (async () => {
            await Promise.allSettled(this.gamePromises);
            callback();
        })();
    }
}
