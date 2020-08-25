import { WorkerCloseProtocol } from "../../../helpers/workers/WorkerRequest";
import { PortMessageBase, PortResultBase } from
    "../../worker/helpers/AsyncPort";
import { AugmentedExperience } from "../AugmentedExperience";

/** Mapped type for decoder requests. */
export type DecoderRequestMap =
{
    decode: {message: DecodeMessage, result: DecodeResult}
} & WorkerCloseProtocol;

/** Types of decoder requests. */
export type DecoderRequestType = keyof DecoderRequestMap;

/** Types of messages that the decoder worker can receive. */
export type DecoderMessage = DecoderRequestMap[DecoderRequestType]["message"];

/** Base interface for decoder messages. */
type DecoderMessageBase<T extends DecoderRequestType> = PortMessageBase<T>;

/** Asks for the next AugmentedExperience from the tfrecord file. */
export interface DecodeMessage extends DecoderMessageBase<"decode">
{
    /** Path to the file to decode. */
    readonly path: string;
}

/** Types of messages that the decoder pool can receive. */
export type DecoderResult = DecoderRequestMap[DecoderRequestType]["result"];

/** Base interface for decoder results. */
type DecoderResultBase<T extends DecoderRequestType> = PortResultBase<T>;

/** Result of the decode op. */
export interface DecodeResult extends DecoderResultBase<"decode">
{
    /**
     * Decoded experience object. If null, then the file has been completely
     * exhausted.
     */
    aexp: AugmentedExperience | null;
    /**
     * Guaranteed one reply per message.
     * @override
     */
    done: true;
}
