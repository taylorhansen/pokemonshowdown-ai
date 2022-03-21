/**
 * @file Worker thread script for the TrainingExampleDecoderPool, managed by a
 * DecoderPort.
 */
import * as fs from "fs";
import * as stream from "stream";
import {serialize} from "v8";
import {parentPort} from "worker_threads";
import {TrainingExample} from "../../../../play/experience";
import {RawPortResultError} from "../../../../port/PortProtocol";
import {WorkerClosed} from "../../../../port/WorkerProtocol";
import {TrainingExampleDecoder} from "../../TrainingExampleDecoder";
import {DecodeResult, DecoderMessage} from "./DecoderProtocol";

if (!parentPort) {
    throw new Error("No parent port!");
}

/** Manages a decoder instance. */
interface DecoderRegistry {
    /** TrainingExample generator. */
    readonly gen: AsyncGenerator<TrainingExample, null>;
    /** Promise that's currently using the generator. */
    inUse: Promise<void>;
}

/** Tracks all currently active decoders. */
const decoders = new Map<string, DecoderRegistry>();

parentPort.on("message", (msg: DecoderMessage) => {
    if (msg.type === "close") {
        // Close all decoder streams.
        const closePromises: Promise<void>[] = [];
        for (const {gen} of decoders.values()) {
            closePromises.push(
                (async function () {
                    // Indicate that the stream needs to close prematurely.
                    // eslint-disable-next-line no-empty
                    while (!(await gen.next(true)).done) {}
                })(),
            );
        }

        const result: WorkerClosed = {type: "close", rid: msg.rid, done: true};
        parentPort!.postMessage(result);
        return;
    }

    if (!decoders.has(msg.path)) {
        // Setup decoder stream pipeline.
        const fileStream = fs.createReadStream(msg.path);
        const decoderStream = new TrainingExampleDecoder(
            512 * 1024 /*read 512kb*/,
            4 /*emit TrainingExamples*/,
        );

        const pipelinePromise = stream.promises.pipeline(
            fileStream,
            decoderStream,
        );

        // Use an async generator IIFE to emit TrainingExamples.
        const gen = (async function* (): AsyncGenerator<TrainingExample, null> {
            // Continuously read TrainingExamples from decoder unless signaled
            // to stop.
            for await (const example of decoderStream) {
                if (yield example as TrainingExample) {
                    break;
                }
            }

            fileStream.close();
            decoderStream.destroy();
            decoders.delete(msg.path);

            // Wait for the stream to fully close.
            await pipelinePromise;

            // Indicate that the file was exhausted.
            return null;
        })();
        decoders.set(msg.path, {gen, inUse: Promise.resolve()});
    }

    // Get the registered decoder.
    const decoder = decoders.get(msg.path)!;

    decoder.inUse = decoder.inUse
        .then(async function nextExample() {
            // Get the next TrainingExample (or null if file exhausted).
            const example = (await decoder.gen.next()).value;
            const result: DecodeResult = {
                type: "decode",
                rid: msg.rid,
                done: true,
                example,
            };
            parentPort!.postMessage(
                result,
                example ? example.state.map(a => a.buffer) : undefined,
            );
        })
        .catch((err: Error) => {
            // Pass error for logging.
            const errBuf = serialize(err);
            const result: RawPortResultError = {
                type: "error",
                rid: msg.rid,
                done: true,
                err: errBuf,
            };
            parentPort!.postMessage(result, [errBuf.buffer]);
        });
});
