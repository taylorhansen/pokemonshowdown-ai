import * as path from "path";
import * as stream from "stream";
import {AugmentedExperience} from "../../../play/experience";
import {ThreadPool} from "../../../pool";
import {DecoderProtocol, DecoderWorkerData} from "./worker/DecoderProtocol";
import {DecoderWorker} from "./worker/DecoderWorker";

/** Path to the decoder worker script. */
const workerScriptPath = path.resolve(__dirname, "worker", "worker.js");

/** Thread pool for decoding multiple `.tfrecord` files in parallel. */
export class AExpDecoderPool {
    /** Number of threads in the thread pool. */
    public get numThreads(): number {
        return this.pool.numThreads;
    }

    /** Wrapped thread pool for managing decoder workers. */
    private readonly pool: ThreadPool<
        DecoderWorker,
        DecoderProtocol,
        keyof DecoderProtocol,
        DecoderWorkerData
    >;

    /**
     * Creates an AExpDecoderPool.
     *
     * @param numThreads Number of workers to create.
     */
    public constructor(numThreads: number) {
        this.pool = new ThreadPool(
            numThreads,
            workerScriptPath,
            DecoderWorker,
            () => undefined /*workerData*/,
        );
    }

    /**
     * Dispatches the thread pool to decode the files.
     *
     * @param files Files to decode. Workers are assigned to files one-by-one in
     * the order specified.
     * @param highWaterMark High water mark buffer limit for AugmentedExperience
     * objs. Defaults to the number of threads.
     * @yields Decoded AugmentedExperience objs. Order may be nondeterministic
     * due to worker scheduling.
     */
    public async *decode(
        files: readonly string[],
        highWaterMark = this.numThreads,
    ): AsyncGenerator<AugmentedExperience, void> {
        // Setup main aexp stream.
        // Unique event for this call that indicates that the threads should
        // push some more aexps to the stream.
        const readAExp = Symbol("readAExp");
        const aexpInput = new stream.Readable({
            objectMode: true,
            highWaterMark,
            read() {
                this.emit(readAExp);
            },
        });
        // Note: Backpressure can cause listeners to build up, but they should
        // always stay under the number of threads.
        aexpInput.setMaxListeners(this.numThreads);

        // Setup path generator.
        // This lets each thread take the next unprocessed file without multiple
        // threads processing the same file.
        const fileGen = (function* () {
            for (const file of files) {
                yield file;
            }
        })();

        // Setup threads for reading tfrecords.
        const threadPromises: Promise<void>[] = [];
        let done = false; // Signal to prematurely close the thread pool.
        for (let i = 0; i < this.numThreads; ++i) {
            threadPromises.push(
                (async () => {
                    const port = await this.pool.takePort();
                    try {
                        // Get the next file path.
                        // Note: As multiple async contexts are looping through
                        // the fileGen, it'll be giving its next path to
                        // whoever's ready first until it's done.
                        for (const file of fileGen) {
                            if (done) {
                                break;
                            }
                            // Extract all aexps from the file and push to the
                            // aexpInput stream.
                            let aexp: AugmentedExperience | null;
                            while (!done && (aexp = await port.decode(file))) {
                                // Respect backpressure.
                                if (!aexpInput.push(aexp)) {
                                    await new Promise(res =>
                                        aexpInput.once(readAExp, res),
                                    );
                                }
                            }
                        }
                    } finally {
                        this.pool.givePort(port);
                    }
                })(),
            );
        }

        // End the aexpInput stream once each file has been fully consumed.
        const allDone = Promise.all(threadPromises).finally(() => {
            done = true;
            aexpInput.push(null);
            // Make sure thread promises update.
            aexpInput.emit(readAExp);
        });
        // Suppress uncaught errors until we can await the promise at the end.
        // TODO: If all promises reject, then the generator loop would hang.
        allDone.catch(() => {});

        // Generator loop.
        for await (const aexp of aexpInput) {
            yield aexp;
        }

        // Force errors to propagate, if any.
        await allDone;
    }

    /** Closes the thread pool. */
    public async close(): Promise<void> {
        return await this.pool.close();
    }
}
