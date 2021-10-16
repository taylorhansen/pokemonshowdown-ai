/** @file Defines the protocol typings for DecoderWorkers. */
import { AugmentedExperience } from "../../../../play/experience";
import { PortMessageBase, PortResultBase } from "../../../../port/PortProtocol";
import { WorkerProtocol } from "../../../../port/WorkerProtocol";

/** DecoderWorker request protocol typings. */
export interface DecoderProtocol extends WorkerProtocol<"decode">
{
    decode: {message: DecodeMessage, result: DecodeResult}
}

/** Types of decoder requests. */
export type DecoderRequestType = keyof DecoderProtocol;

/** Types of messages that the decoder worker can receive. */
export type DecoderMessage = DecoderProtocol[DecoderRequestType]["message"];

/** Base interface for decoder messages. */
type DecoderMessageBase<T extends DecoderRequestType> = PortMessageBase<T>;

/** Asks for the next AugmentedExperience from the tfrecord file. */
export interface DecodeMessage extends DecoderMessageBase<"decode">
{
    /** Path to the file to decode. */
    readonly path: string;
}

/** Types of messages that the decoder pool can receive. */
export type DecoderResult = DecoderProtocol[DecoderRequestType]["result"];

/** Base interface for decoder results. */
type DecoderResultBase<T extends DecoderRequestType> = PortResultBase<T>;

/** Result of the decode op. */
export interface DecodeResult extends DecoderResultBase<"decode">
{
    /** Decoded experience object, or null if EOF. */
    aexp: AugmentedExperience | null;
    /** @override */
    done: true;
}
