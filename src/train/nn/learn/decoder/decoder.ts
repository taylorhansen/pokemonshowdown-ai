import * as fs from "fs";
import * as stream from "stream";
import * as util from "util";
import { serialize } from "v8";
import { parentPort } from "worker_threads";
import { TFRecordToAExp } from "../../../helpers/TFRecordToAExp";
import { WorkerClosed } from "../../../helpers/workers/WorkerRequest";
import { RawPortResultError } from "../../worker/helpers/AsyncPort";
import { AugmentedExperience } from "../AugmentedExperience";
import { DecodeResult, DecoderMessage } from "./DecoderRequest";

const pipeline = util.promisify(stream.pipeline);

if (!parentPort) throw new Error("No parent port!");

/** Manages a decoder instance. */
interface DecoderRegistry
{
    /** AugmentedExperience generator. */
    readonly gen: AsyncGenerator<AugmentedExperience, null>
    /** Promise that's currently using the generator. */
    inUse: Promise<void>;
}

/** Tracks all currently active decoders. */
const decoders = new Map<string, DecoderRegistry>();

parentPort.on("message", (msg: DecoderMessage) =>
{
    if (msg.type === "close")
    {
        // close all decoder streams
        const closePromises: Promise<void>[] = [];
        for (const {gen} of decoders.values())
        {
            closePromises.push(async function()
            {
                // indicate that the stream needs to close prematurely
                while (!(await gen.next(true)).done);
            }());
        }

        const result: WorkerClosed = {type: "close", rid: msg.rid, done: true};
        parentPort!.postMessage(result);
        return;
    }

    if (!decoders.has(msg.path))
    {
        // setup decoder stream pipeline
        const fileStream = fs.createReadStream(msg.path);
        const decoderStream = new TFRecordToAExp(/*maxExp*/ 4);

        const pipelinePromise = pipeline(fileStream, decoderStream);

        // use an async generator iife to emit AugmentedExperiences
        const gen = async function*(): AsyncGenerator<AugmentedExperience, null>
        {
            // continuously read aexps from decoder unless signaled to stop
            for await (const aexp of decoderStream)
            {
                if (yield aexp as AugmentedExperience) break;
            }

            fileStream.close();
            decoderStream.destroy();
            decoders.delete(msg.path);

            // wait for the stream to fully close
            await pipelinePromise;

            // indicate that the file was exhausted
            return null;
        }();
        decoders.set(msg.path, {gen, inUse: Promise.resolve()});
    }

    // get the registered decoder
    const decoder = decoders.get(msg.path)!;

    decoder.inUse = decoder.inUse
        .then(async function nextAExp()
        {
            // get the next aexp (or null if file exhausted)
            const aexp = (await decoder.gen.next()).value;
            const result: DecodeResult =
                {type: "decode", rid: msg.rid, done: true, aexp};
            parentPort!.postMessage(result,
                aexp ? [aexp.probs.buffer, aexp.state.buffer] : undefined);
        })
        .catch((err: Error) =>
        {
            // pass error for logging
            const errBuf = serialize(err);
            const result: RawPortResultError =
            {
                type: "error", rid: msg.rid, done: true,
                err: errBuf
            };
            parentPort!.postMessage(result, [errBuf.buffer]);
        })
});
