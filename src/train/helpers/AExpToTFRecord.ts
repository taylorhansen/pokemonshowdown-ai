import { Transform, TransformCallback } from "stream";
import * as tfrecord from "tfrecord";
import { maskedCrc32c } from "tfrecord/lib/crc32c";
import { AugmentedExperience } from "../nn/learn/AugmentedExperience";
import { footerBytes, headerBytes, lengthBytes } from "./tfrecordHelpers";

/**
 * Serializes AugmentedExperiences into TFRecord Example segments. This is
 * intended to pipe directly to a `.tfrecord` file.
 */
export class AExpToTFRecord extends Transform
{
    /** TFRecord Example builder. */
    private readonly builder = tfrecord.createBuilder();

    // adapted from tfrecord/src/record_writer.ts and writer.ts
    /**
     * Main metadata buffer that wraps serialized TFRecord Examples. Reused for
     * each `_transform` call to save on allocations.
     */
    private readonly metadata = new ArrayBuffer(headerBytes);
    /** Buffer for reading 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrcBuffer = new Uint8Array(this.metadata, 0,
        headerBytes);
    /** View for extracting 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrc = new DataView(this.metadata, 0, headerBytes);
    /** Points to length for crc32c computations. */
    private readonly lengthBuffer = Buffer.from(this.metadata, 0, lengthBytes);

    /**
     * Creates an AExpToTFRecord stream.
     * @param maxExp High water mark for the AugmentedExperience buffer. If the
     * buffer fills up past this point, the stream will apply backpressure.
     */
    constructor(maxExp = 16)
    {
        super(
        {
            encoding: "binary",
            writableObjectMode: true, writableHighWaterMark: maxExp
        });

        // high order bits of length segment should stay unset
        this.lengthAndCrc.setUint32(4, 0, /*littleEndian*/ true);
    }

    /** @override */
    public _transform(aexp: AugmentedExperience, encoding: BufferEncoding,
        callback: TransformCallback): void
    {
        // serialize Example
        const example = this.aexpToExample(aexp);
        // when supported, the encoder should be using buffers automatically
        const record = tfrecord.Example.encode(example).finish();
        if (!Buffer.isBuffer(record))
        {
            throw new Error("Example encoder didn't use Buffers");
        }

        // encode length in metadata
        this.lengthAndCrc.setUint32(0, record.length, /*littleEndian*/ true);

        // compute header
        this.lengthAndCrc.setUint32(lengthBytes,
            maskedCrc32c(this.lengthBuffer), /*littleEndian*/ true);
        this.push(this.lengthAndCrcBuffer, "binary");

        // insert serialized Example
        this.push(record, "binary");

        // compute footer
        this.lengthAndCrc.setUint32(0, maskedCrc32c(record),
            /*littleEndian*/ true);
        this.push(this.lengthAndCrcBuffer.slice(0, footerBytes), "binary");

        callback();
    }

    /** Compiles an AugmentedExperience into a TFRecord Example. */
    private aexpToExample(aexp: AugmentedExperience): tfrecord.Example
    {
        this.builder.setInteger("action", aexp.action);
        this.builder.setFloat("advantage", aexp.advantage);
        this.builder.setFloats("probs", Array.from(aexp.probs));
        this.builder.setFloat("returns", aexp.returns);
        this.builder.setFloats("state", Array.from(aexp.state));
        this.builder.setFloat("value", aexp.value);
        return this.builder.releaseExample();
    }
}
