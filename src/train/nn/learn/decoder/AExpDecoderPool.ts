import * as path from "path";
import * as stream from "stream";
import { ThreadPool } from "../../../helpers/workers/ThreadPool";
import { AugmentedExperience } from "../AugmentedExperience";
import { DecoderPort } from "./DecoderPort";
import { DecoderRequestMap } from "./DecoderRequest";

/** Path to the decoder worker script. */
const workerScriptPath = path.resolve(__dirname, "decoder.js");

/** Uses a `worker_threads` pool to dispatch parallel tfrecord decoders. */
export class AExpDecoderPool extends ThreadPool<DecoderPort, DecoderRequestMap>
{
    /** Indicates that the thread pool is in use. */
    private inUse = Promise.resolve();

    /**
     * Creates an AExpDecoderPool.
     * @param numThreads Number of workers to create. Defaults to the number of
     * CPUs on the current system.
     */
    constructor(numThreads?: number)
    {
        super(workerScriptPath, DecoderPort, undefined, numThreads);
    }

    /**
     * Dispatches the thread pool to decode the files.
     * @param files Files to decode.
     * @param highWaterMark High water mark for aexp buffer.
     * @returns An async generator for decoding the files.
     */
    public async decode(files: readonly string[],
        highWaterMark = this.numThreads):
        Promise<AsyncGenerator<AugmentedExperience, void>>
    {
        return new Promise((res, rej) =>
        {
            this.inUse = this.inUse
                .then(() => res(this.decodeImpl(files, highWaterMark)))
                .catch(rej)
        });
    }

    private async* decodeImpl(files: readonly string[], highWaterMark: number):
        AsyncGenerator<AugmentedExperience, void>
    {
        // setup main aexp stream
        // event indicates that the threads should push some aexps to the stream
        const readAExpEvent = Symbol("readAExpEvent");
        const aexpInput = new stream.Readable(
        {
            objectMode: true, highWaterMark,
            read() { this.emit(readAExpEvent); }
        });

        // setup path generator
        // this lets each thread take the next file after finishing the previous
        //  one without repeating
        const fileGen = function*()
        {
            for (const file of files) yield file;
        }();

        // setup threads for loading/extracting tfrecords
        const threadPromises: Promise<void>[] = [];
        let done = false; // signal to prematurely close the thread pool
        for (let i = 0; i < this.numThreads; ++i)
        {
            threadPromises.push(this.takePort()
                .then(async port =>
                {
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
                                    res => aexpInput.once(readAExpEvent, res));
                            }
                        }
                    }
                    // rethrow
                    catch (err) { throw err; }
                    // make sure the port gets returned to the thread pool
                    finally { this.givePort(port); }
                }));
        }

        // end the aexpInput stream once each file has been fully consumed
        const allDone = Promise.all(threadPromises)
            .catch(err => { throw err; }) // rethrow
            .finally(() =>
            {
                done = true;
                aexpInput.push(null);
                // make sure thread promises update
                aexpInput.emit(readAExpEvent);
            });

        // generator loop
        for await (const aexp of aexpInput) yield aexp;

        // force errors to propagate, if any
        await allDone;
    }
}
