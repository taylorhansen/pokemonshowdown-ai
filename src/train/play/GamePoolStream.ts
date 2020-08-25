import { Transform, TransformCallback } from "stream";
import { ThreadPool } from "../helpers/workers/ThreadPool";
import { GamePool, GamePoolArgs, GamePoolResult } from "./GamePool";

/** Wraps GamePool's `#playGame()` method into a Transform stream. */
export class GamePoolStream extends Transform
{
    /**
     * Creates a GamePoolStream.
     * @param pool GamePool to wrap. For now, each GamePoolStream should be
     * constructed with its own GamePool.
     */
    constructor(private readonly pool: GamePool)
    {
        super({objectMode: true, highWaterMark: pool.numThreads});

        // pass GamePool worker errors through the stream pipeline
        pool.on(ThreadPool.workerErrorEvent, err =>
        {
            const result: GamePoolResult = {experiences: [], err};
            this.push(result);
        });
    }

    /** @override */
    public async _transform(args: GamePoolArgs, encoding: BufferEncoding,
        callback: TransformCallback): Promise<void>
    {
        // queue a game, passing errors and queueing the next one once a port
        //  has been assigned
        this.pool.addGame(args, callback)
            .then(result => this.push(result))
            .catch(err => this.emit("error", err));
    }

    /** @override */
    public _flush(callback: TransformCallback): void
    {
        // wait for all games to finish, then the stream can be safely closed
        // TODO: support shared GamePools by tracking queued games that belong
        //  to this stream
        this.pool.freeAllPorts().then(() => callback()).catch(callback);
    }
}
