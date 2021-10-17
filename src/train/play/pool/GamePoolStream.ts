import { Transform, TransformCallback } from "stream";
import { GamePool, GamePoolArgs } from "./GamePool";

/**
 * Pipes game configs through a thread pool to generate game results.
 *
 * Wraps {@link GamePool.addGame} into a Transform stream. Results order may be
 * nondeterministic due to worker scheduling.
 */
export class GamePoolStream extends Transform
{
    /** Keeps track of currently running games. */
    private readonly gamePromises = new Set<Promise<void>>();

    /**
     * Creates a GamePoolStream.
     *
     * @param pool GamePool to wrap. For now, each GamePoolStream should be
     * constructed with its own GamePool.
     */
    constructor(private readonly pool: GamePool)
    {
        super({objectMode: true, highWaterMark: pool.numThreads});
    }

    public override _transform(args: GamePoolArgs, encoding: BufferEncoding,
        callback: TransformCallback): void
    {
        // queue a game, passing errors and queueing the next one once a port
        //  has been assigned
        const gamePromise = (async () =>
        {
            try { this.push(await this.pool.addGame(args, callback)); }
            // generally addGame() should swallow/wrap errors, but if anything
            //  happens outside of that then the stream should crash
            catch (err) { this.emit("error", err); }
        })();
        this.gamePromises.add(gamePromise);

        // cleanup after the game to keep the Set from getting too big
        gamePromise.finally(() => this.gamePromises.delete(gamePromise));
    }

    public override _flush(callback: TransformCallback): void
    {
        // wait for all queued games to finish, then the stream can safely close
        (async () =>
        {
            await Promise.allSettled(this.gamePromises);
            callback();
        })();
    }
}
