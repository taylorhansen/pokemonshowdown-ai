/** Worker thread script for the AExpDecoderPool, managed by a DecoderPort. */
import * as fs from "fs";
import * as stream from "stream";
import {serialize} from "v8";
import {parentPort} from "worker_threads";
import {AugmentedExperience} from "../../../../play/experience";
import {RawPortResultError} from "../../../../port/PortProtocol";
import {WorkerClosed} from "../../../../port/WorkerProtocol";
import {AExpDecoder} from "../../AExpDecoder";
import {DecodeResult, DecoderMessage} from "./DecoderProtocol";

if (!parentPort) {
    throw new Error("No parent port!");
}

/** Manages a decoder instance. */
interface DecoderRegistry {
    /** AugmentedExperience generator. */
    readonly gen: AsyncGenerator<AugmentedExperience, null>;
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
        const decoderStream = new AExpDecoder(
            512 * 1024 /*read 512kb*/,
            4 /*emit aexps*/,
        );

        const pipelinePromise = stream.promises.pipeline(
            fileStream,
            decoderStream,
        );

        // Use an async generator IIFE to emit AugmentedExperiences.
        const gen = (async function* (): AsyncGenerator<
            AugmentedExperience,
            null
        > {
            // Continuously read aexps from decoder unless signaled to stop.
            for await (const aexp of decoderStream) {
                if (yield aexp as AugmentedExperience) {
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
        .then(async function nextAExp() {
            // Get the next aexp (or null if file exhausted).
            const aexp = (await decoder.gen.next()).value;
            const result: DecodeResult = {
                type: "decode",
                rid: msg.rid,
                done: true,
                aexp,
            };
            parentPort!.postMessage(
                result,
                aexp
                    ? [aexp.probs.buffer, ...aexp.state.map(a => a.buffer)]
                    : undefined,
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
