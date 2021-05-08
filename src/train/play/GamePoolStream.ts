import { Transform, TransformCallback } from "stream";
import { WrappedError } from "../helpers/WrappedError";
import { GamePool, GamePoolArgs, GamePoolResult } from "./GamePool";

/** Wraps GamePool's `#addGame()` method into a Transform stream. */
export class GamePoolStream extends Transform
{
    /** Keeps track of currently running games. */
    private readonly gamePromises = new Set<Promise<void>>();

    /**
     * Creates a GamePoolStream.
     * @param pool GamePool to wrap. For now, each GamePoolStream should be
     * constructed with its own GamePool.
     */
    constructor(private readonly pool: GamePool)
    {
        super({objectMode: true, highWaterMark: pool.numThreads});

        // pick up any extra worker errors and pass them through the stream
        //  pipeline for logging later
        pool.on(GamePool.workerErrorEvent, err =>
        {
            const result: GamePoolResult =
            {
                numAExps: 0,
                err: new WrappedError(err,
                    msg => "Worker threw an error: " + msg)
            };
            this.push(result);
        });
    }

    /** @override */
    public _transform(args: GamePoolArgs, encoding: BufferEncoding,
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

    /** @override */
    public _flush(callback: TransformCallback): void
    {
        // wait for all queued games to finish, then the stream can safely close
        (async () =>
        {
            await Promise.allSettled(this.gamePromises);
            callback();
        })();
    }
}
