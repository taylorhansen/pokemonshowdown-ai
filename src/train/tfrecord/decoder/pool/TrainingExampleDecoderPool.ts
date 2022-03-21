import * as path from "path";
import * as stream from "stream";
import {TrainingExample} from "../../../play/experience";
import {ThreadPool} from "../../../pool";
import {DecoderProtocol, DecoderWorkerData} from "./worker/DecoderProtocol";
import {DecoderWorker} from "./worker/DecoderWorker";

/** Path to the decoder worker script. */
const workerScriptPath = path.resolve(__dirname, "worker", "worker.js");

/** Thread pool for decoding multiple `.tfrecord` files in parallel. */
export class TrainingExampleDecoderPool {
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
     * Creates a TrainingExampleDecoderPool.
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
     * @param highWaterMark High water mark buffer limit for TrainingExamples.
     * Defaults to the number of threads.
     * @yields Decoded {@link TrainingExample}s. Order may be nondeterministic
     * due to worker scheduling.
     */
    public async *decode(
        files: readonly string[],
        highWaterMark = this.numThreads,
    ): AsyncGenerator<TrainingExample, void> {
        // Setup main TrainingExample stream.
        // Unique event for this call that indicates that the threads should
        // push some more TrainingExamples to the stream.
        const readExample = Symbol("readExample");
        const exampleInput = new stream.Readable({
            objectMode: true,
            highWaterMark,
            read() {
                this.emit(readExample);
            },
        });
        // Note: Backpressure can cause listeners to build up, but they should
        // always stay under the number of threads.
        exampleInput.setMaxListeners(this.numThreads);

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
                            // Extract all TrainingExamples from the file and
                            // push them to the exampleInput stream.
                            let te: TrainingExample | null;
                            while (!done && (te = await port.decode(file))) {
                                // Respect backpressure.
                                if (!exampleInput.push(te)) {
                                    await new Promise(res =>
                                        exampleInput.once(readExample, res),
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

        // End the exampleInput stream once each file has been fully consumed.
        const allDone = Promise.all(threadPromises).finally(() => {
            done = true;
            exampleInput.push(null);
            // Make sure thread promises update.
            exampleInput.emit(readExample);
        });
        // Suppress uncaught errors until we can await the promise at the end.
        // TODO: If all promises reject, then the generator loop would hang.
        allDone.catch(() => {});

        // Generator loop.
        for await (const te of exampleInput) {
            yield te;
        }

        // Force errors to propagate, if any.
        await allDone;
    }

    /** Closes the thread pool. */
    public async close(): Promise<void> {
        return await this.pool.close();
    }
}
