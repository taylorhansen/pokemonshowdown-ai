import {Transform, TransformCallback} from "stream";
import * as tfrecord from "tfrecord";
import {maskedCrc32c} from "tfrecord/lib/crc32c";
import {AugmentedExperience} from "../../play/experience";
import {footerBytes, headerBytes, lengthBytes} from "../helpers";

/**
 * Serializes AugmentedExperiences into TFRecord Example segments.
 *
 * This is intended to pipe directly to a `.tfrecord` file in binary mode,
 * either appending (if the format is already valid) or overwriting.
 */
export class AExpEncoder extends Transform {
    /** TFRecord Example builder. */
    private readonly builder = tfrecord.createBuilder();

    // Adapted from tfrecord/src/record_writer.ts and writer.ts.
    /**
     * Main metadata buffer that wraps serialized TFRecord Examples. Reused for
     * each `_transform` call to save on allocations.
     */
    private readonly metadata = new ArrayBuffer(headerBytes);
    /** Buffer for reading 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrcBuffer = new Uint8Array(
        this.metadata,
        0,
        headerBytes,
    );
    /** View for extracting 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrc = new DataView(this.metadata, 0, headerBytes);
    /** Points to length for crc32c computations. */
    private readonly lengthBuffer = Buffer.from(this.metadata, 0, lengthBytes);

    /**
     * Creates an AExpEncoder stream.
     *
     * @param maxExp High water mark for the AugmentedExperience buffer. If the
     * buffer fills up past this point, the stream will apply backpressure.
     */
    public constructor(maxExp = 16) {
        super({
            encoding: "binary",
            writableObjectMode: true,
            writableHighWaterMark: maxExp,
        });

        // High order bits of length segment should stay unset.
        this.lengthAndCrc.setUint32(4, 0, true /*littleEndian*/);
    }

    public override _transform(
        aexp: AugmentedExperience,
        encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        // Serialize Example.
        const example = this.aexpToExample(aexp);
        // When supported, the encoder should be using buffers automatically.
        const record = tfrecord.Example.encode(example).finish();
        if (!Buffer.isBuffer(record)) {
            throw new Error("Example encoder didn't use Buffers");
        }

        // Encode length in metadata.
        this.lengthAndCrc.setUint32(0, record.length, true /*littleEndian*/);

        // Compute header.
        this.lengthAndCrc.setUint32(
            lengthBytes,
            maskedCrc32c(this.lengthBuffer),
            true /*littleEndian*/,
        );
        this.push(this.lengthAndCrcBuffer, "binary");

        // Insert serialized Example.
        this.push(record, "binary");

        // Compute footer.
        this.lengthAndCrc.setUint32(
            0,
            maskedCrc32c(record),
            true /*littleEndian*/,
        );
        this.push(this.lengthAndCrcBuffer.slice(0, footerBytes), "binary");

        callback();
    }

    /** Compiles an AugmentedExperience into a TFRecord Example. */
    private aexpToExample(aexp: AugmentedExperience): tfrecord.Example {
        this.builder.setInteger("action", aexp.action);
        this.builder.setFloat("advantage", aexp.advantage);
        this.builder.setFloats("probs", Array.from(aexp.probs));
        this.builder.setFloat("returns", aexp.returns);
        this.builder.setFloats("state", Array.from(aexp.state));
        this.builder.setFloat("value", aexp.value);
        return this.builder.releaseExample();
    }
}
