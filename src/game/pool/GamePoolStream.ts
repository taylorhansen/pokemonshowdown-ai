import {Transform, TransformCallback} from "stream";
import {GamePool, GamePoolArgs} from "./GamePool";

/**
 * Wraps {@link GamePool.add} into a Transform stream, piping game config
 * objects through a thread pool to generate game results. Output order may be
 * nondeterministic due to worker scheduling.
 */
export class GamePoolStream extends Transform {
    /** Keeps track of currently running games. */
    private readonly gamePromises = new Set<Promise<void>>();

    /**
     * Creates a GamePoolStream.
     *
     * @param pool GamePool to wrap.
     */
    public constructor(private readonly pool: GamePool) {
        super({objectMode: true, highWaterMark: 1});
    }

    public override _transform(
        args: GamePoolArgs,
        encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        // Queue a game, then queueing the next game once a port has been
        // assigned and the game starts.
        const gamePromise = (async () => {
            try {
                this.push(await this.pool.add(args, callback));
            } catch (err) {
                // Generally add() should swallow/wrap errors, otherwise fail
                // loudly.
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
            await Promise.allSettled([...this.gamePromises]);
            this.gamePromises.clear();
            callback();
        })();
    }
}
