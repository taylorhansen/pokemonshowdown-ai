import { WorkerPort } from "../../../helpers/workers/WorkerPort";
import { AugmentedExperience } from "../AugmentedExperience";
import { DecodeMessage, DecoderRequestMap } from "./DecoderRequest";

/** Wraps a DecoderPool worker to provide Promise functionality. */
export class DecoderPort extends WorkerPort<DecoderRequestMap>
{
    /**
     * Asks for the next AugmentedExperience in the given tfrecord file. If the
     * Promise resolves to null, then the worker has reached the end of the file
     * and the next call will restart from the beginning.
     */
    public decode(path: string): Promise<AugmentedExperience | null>
    {
        const msg: DecodeMessage =
            {type: "decode", rid: this.generateRID(), path};

        return new Promise((res, rej) =>
            this.postMessage<"decode">(msg, [],
                result => result.type === "error" ?
                    rej(result.err) : res(result.aexp)));
    }
}
