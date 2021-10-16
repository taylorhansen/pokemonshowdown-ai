import * as path from "path";
import * as stream from "stream";
import { AugmentedExperience } from "../../../play/experience";
import { ThreadPool } from "../../../pool";
import { DecoderProtocol } from "./worker/DecoderProtocol";
import { DecoderWorker } from "./worker/DecoderWorker";

/** Path to the decoder worker script. */
const workerScriptPath = path.resolve(__dirname, "worker", "worker.js");

/** Thread pool for decoding multiple `.tfrecord` files in parallel. */
export class AExpDecoderPool
{
    /** Number of threads in the thread pool. */
    public get numThreads(): number { return this.pool.numThreads; }

    /** Wrapped thread pool for managing decoder workers. */
    private readonly pool:
        ThreadPool<DecoderWorker, DecoderProtocol, keyof DecoderProtocol>;

    /**
     * Creates an AExpDecoderPool.
     *
     * @param numThreads Number of workers to create.
     */
    constructor(numThreads: number)
    {
        this.pool = new ThreadPool(numThreads, workerScriptPath, DecoderWorker,
            /*workerData*/ undefined);
    }

    /**
     * Dispatches the thread pool to decode the files.
     *
     * @param files Files to decode.
     * @param highWaterMark High water mark buffer limit for AugmentedExperience
     * objs. Defaults to the number of threads.
     * @yields Decoded AugmentedExperience objs. Order may be nondeterministic
     * due to worker scheduling.
     */
    public async* decode(files: readonly string[],
        highWaterMark = this.numThreads):
        AsyncGenerator<AugmentedExperience, void>
    {
        // setup main aexp stream
        // unique event for this call that indicates that the threads should
        //  push some more aexps to the stream
        const readAExp = Symbol("readAExp");
        const aexpInput = new stream.Readable(
            {objectMode: true, highWaterMark, read() { this.emit(readAExp); }});

        // setup path generator
        // this lets each thread take the next unprocessed file without multiple
        //  threads processing the same file
        const fileGen = function*() { for (const file of files) yield file; }();

        // setup threads for loading/extracting tfrecords
        const threadPromises: Promise<void>[] = [];
        let done = false; // signal to prematurely close the thread pool
        for (let i = 0; i < this.numThreads; ++i)
        {
            threadPromises.push((async () =>
            {
                const port = await this.pool.takePort();
                try
                {
                    // get the next file path
                    for (const file of fileGen)
                    {
                        if (done) break;
                        // extract all aexps from the file and push to the
                        //  aexpInput stream
                        let aexp: AugmentedExperience | null;
                        while (!done && (aexp = await port.decode(file)))
                        {
                            // respect backpressure
                            if (aexpInput.push(aexp)) continue;
                            await new Promise(
                                res => aexpInput.once(readAExp, res));
                        }
                    }
                }
                finally { this.pool.givePort(port); }
            })());
        }

        // end the aexpInput stream once each file has been fully consumed
        const allDone = Promise.all(threadPromises)
            .finally(() =>
            {
                done = true;
                aexpInput.push(null);
                // make sure thread promises update
                aexpInput.emit(readAExp);
            });
        // suppress uncaught errors until we can await the promise
        allDone.catch(() => {});

        // generator loop
        for await (const aexp of aexpInput) yield aexp;

        // force errors to propagate, if any
        await allDone;
    }

    /** Closes the thread pool. */
    public async close(): Promise<void>
    {
        return await this.pool.close();
    }
}
