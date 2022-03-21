import {Transform, TransformCallback} from "stream";
import * as tfrecord from "tfrecord";
import {maskedCrc32c} from "tfrecord/lib/crc32c";
import {TrainingExample} from "../../play/experience";
import {footerBytes, headerBytes, lengthBytes} from "../constants";

/**
 * Serializes {@link TrainingExample}s into TFRecord Example segments.
 *
 * This is intended to pipe directly to a `.tfrecord` file in binary mode,
 * either appending (if the format is already valid) or overwriting.
 */
export class TrainingExampleEncoder extends Transform {
    /** TFRecord Example builder. */
    private readonly builder = tfrecord.createBuilder();

    // Adapted from tfrecord/src/record_writer.ts and writer.ts to work with
    // streams/buffers directly rather than just files.
    /**
     * Main metadata buffer that wraps serialized TFRecord Examples. Reused for
     * each `_transform` call to save on allocations.
     */
    private readonly metadata = new ArrayBuffer(
        Math.max(headerBytes, footerBytes),
    );
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
     * Creates a TrainingExampleEncoder stream.
     *
     * @param writableHighWaterMark High water mark for the output buffer. If
     * the buffer fills up past this point, the stream will apply backpressure.
     */
    public constructor(writableHighWaterMark = 16) {
        super({
            encoding: "binary",
            writableObjectMode: true,
            writableHighWaterMark,
        });

        // High-order bits of length segment should stay unset.
        this.lengthAndCrc.setUint32(4, 0, true /*littleEndian*/);
    }

    public override _transform(
        te: TrainingExample,
        encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        try {
            // Serialize Example.
            const record = this.encodeTrainingExample(te);

            // Compute length with header.
            this.lengthAndCrc.setUint32(
                0,
                record.length,
                true /*littleEndian*/,
            );
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
        } catch (e) {
            callback(e as Error);
            return;
        }
        callback();
    }

    /** Encodes a TrainingExample into TFRecord data. */
    private encodeTrainingExample(te: TrainingExample): Buffer {
        // TODO: Verify field values?
        this.builder.setBinaries(
            "state",
            te.state.map(arr => new Uint8Array(arr.buffer)),
        );
        this.builder.setInteger("action", te.action);
        this.builder.setFloat("returns", te.returns);
        const example = this.builder.releaseExample();

        const record = tfrecord.Example.encode(example).finish();
        if (!Buffer.isBuffer(record)) {
            throw new Error("Example encoder didn't use Buffers");
        }
        return record;
    }
}
