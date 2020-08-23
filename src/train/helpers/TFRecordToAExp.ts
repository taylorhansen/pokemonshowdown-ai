import { Transform, TransformCallback } from "stream";
import * as tfrecord from "tfrecord";
import { maskedCrc32c } from "tfrecord/lib/crc32c";
import { exampleToAExp, footerBytes, headerBytes, lengthBytes } from
    "./tfrecordHelpers";

/**
 * Deserializes TFRecord Example segments into AugmentedExperience objects.
 * This is intended to pipe directly from a `.tfrecord` file.
 */
export class TFRecordToAExp extends Transform
{
    /**
     * Event for when a chunk has been read from input and stored in
     * `#nextChunk`. If `#nextChunk` is still null after this event is emitted,
     * then there is no more data to read.
     */
    private static readonly chunkReadEvent = Symbol("kChunkReadEvent");
    /** Event for when the `#nextChunk` has been consumed and set to null. */
    private static readonly chunkConsumedEvent = Symbol("kChunkConsumedEvent");

    /** Internal buffer for reading data. */
    private dataBuffer: Buffer | null = null;
    /**
     * The next chunk to be read. When set or reset, the respective events
     * `.chunkReadEvent` and `chunkConsumedEvent` should be emitted.
     */
    private nextChunk: Buffer | null = null;
    /** Manages the async record reader loop. */
    private recordLoopPromise: Promise<void>;
    /** Promise that resolves once `#_flush()` has been called. */
    private flushPromise = new Promise(res => this.flushResolve = res);
    /** Callback for resolving the flush promise. */
    private flushResolve!: () => void;

    // adapted from tfrecord/src/record_reader.ts and reader.ts
    /**
     * Main metadata buffer that wraps serialized TFRecord Examples. Reused for
     * each `#readRecord()` call to save on allocations.
     */
    private readonly metadata = new ArrayBuffer(headerBytes);
    /** Buffer for reading 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrcBuffer = new Uint8Array(this.metadata, 0,
        headerBytes);
    /** View for extracting 8byte length and 4byte crc32c header. */
    private readonly lengthAndCrc = new DataView(this.metadata, 0, headerBytes);
    /** Points to length for crc32c computations. */
    private readonly lengthBuffer = Buffer.from(this.metadata, 0, lengthBytes);
    /** Buffer for reading Example record and crc32c footer. */
    private recordAndCrcBuffer = new Uint8Array(1);
    /** View for extracting Example record and crc32c footer. */
    private recordAndCrcView = new DataView(this.recordAndCrcBuffer.buffer, 0,
        1);

    /**
     * Creates a TFRecordToAExp stream.
     * @param maxExp High water mark for the AugmentedExperience buffer. If the
     * buffer fills up past this point, the stream will apply backpressure.
     */
    constructor(maxExp = 16)
    {
        super(
        {
            decodeStrings: true,
            readableObjectMode: true, readableHighWaterMark: maxExp,
            writableHighWaterMark: 64 * 1024 // max 64kb
        });

        this.recordLoopPromise = this.recordLoop();
    }

    /** @override */
    public _transform(chunk: Buffer, encoding: BufferEncoding,
        callback: TransformCallback): void
    {
        if (!this.nextChunk)
        {
            // register chunk
            this.nextChunk = chunk;
            this.emit(TFRecordToAExp.chunkReadEvent);
            callback();
        }
        else
        {
            // wait for the next chunk to be consumed
            this.once(TFRecordToAExp.chunkConsumedEvent,
                () => this._transform(chunk, encoding, callback));
        }
    }

    public _flush(callback: (err?: Error | null) => void): void
    {
        if (this.listenerCount(TFRecordToAExp.chunkConsumedEvent) > 0)
        {
            // wait for the remaining chunks to be consumed
            this.once(TFRecordToAExp.chunkConsumedEvent,
                () => this._flush(callback));
            return;
        }

        // signal no more data
        this.flushResolve();

        // wait for the record reader loop to finish
        this.recordLoopPromise =
            this.recordLoopPromise.then(() => callback()).catch(callback);
    }

    /** Executes the record reader loop. */
    private async recordLoop(): Promise<void>
    {
        while (true)
        {
            const recordData = await this.readRecord();
            if (!recordData)
            {
                this.push(null);
                return;
            }
            const example = tfrecord.Example.decode(recordData);
            this.push(exampleToAExp(example));
        }
    }

    /**
     * Extracts a serialized Example from input.
     * @returns A Buffer containing the serialized Example, or null if no more
     * data to read.
     * @throws Error if invalid format.
     */
    private async readRecord(): Promise<Buffer | null>
    {
        // read header
        let bytesRead = await this.consume(this.lengthAndCrcBuffer,
            headerBytes);
        if (bytesRead === 0) return null; // eof
        if (bytesRead !== this.lengthAndCrcBuffer.length)
        {
            throw new Error("Incomplete read. Expected a " +
                `${this.lengthAndCrcBuffer.length} byte header but got ` +
                `${bytesRead} bytes`);
        }

        // parse header
        const length = this.lengthAndCrc.getUint32(0, /*littleEndian*/ true);
        const lengthHigh = this.lengthAndCrc.getUint32(4,
            /*littleEndian*/ true);
        const lengthCrc = this.lengthAndCrc.getUint32(lengthBytes,
            /*littleEndian*/ true);

        // TODO: support 64bit length via Long
        if (lengthHigh) throw new Error("4gb+ tfrecords not supported");

        let expectedCrc = maskedCrc32c(this.lengthBuffer);
        if (lengthCrc !== expectedCrc)
        {
            throw new Error("Incorrect record length CRC32C header. Expected " +
                `${expectedCrc.toString(16)} but got ` +
                lengthCrc.toString(16));
        }

        // get a buffer for record + crc32c footer
        const readLength = length + footerBytes;
        if (this.recordAndCrcBuffer.length < readLength)
        {
            // grow record+crc buffer
            let newLength = this.recordAndCrcBuffer.length;
            while (newLength < readLength) newLength *= 2;

            // alloc new record+crc buffer
            this.recordAndCrcBuffer = new Uint8Array(newLength);
            this.recordAndCrcView = new DataView(this.recordAndCrcBuffer.buffer,
                0, newLength);
        }

        // read record + footer
        bytesRead = await this.consume(this.recordAndCrcBuffer, readLength);
        if (bytesRead !== readLength)
        {
            throw new Error(`Incomplete read. Expected ${readLength} bytes ` +
                `after header but got ${bytesRead} bytes`);
        }

        // extract view of record data
        const recordData = Buffer.from(this.recordAndCrcBuffer.buffer, 0,
            length);

        // parse crc
        const recordCrc = this.recordAndCrcView.getUint32(length,
            /*littleEndian*/ true);
        expectedCrc = maskedCrc32c(recordData);
        if (recordCrc !== maskedCrc32c(recordData))
        {
            throw new Error("Incorrect record CRC32C footer. Expected " +
                `${expectedCrc.toString(16)} but got ` +
                recordCrc.toString(16));
        }

        return recordData;
    }

    /**
     * Consumes data from the internal chunk buffer.
     * @param buffer Buffer to store the data in. Must be at least as long as
     * `length`.
     * @param length Maximum number of bytes to consume.
     * @returns The total amount of bytes consumed. If this is less than the
     * provided `length`, then there's no more data to consume.
     */
    private async consume(buffer: Uint8Array, length: number): Promise<number>
    {
        // read enough data
        const prevLength = this.dataBuffer?.length ?? 0;
        const bytesRead = await this.bufferChunks(length);
        const totalBuffer = prevLength + bytesRead;

        if (!this.dataBuffer) return 0;

        // consume data and write to argument buffer
        const bytesConsumed = Math.min(totalBuffer, length);
        this.dataBuffer.copy(buffer, 0, 0, bytesConsumed);

        // remove the consumed bytes out of the data buffer
        if (totalBuffer - length === 0) this.dataBuffer = null;
        else
        {
            // splice buffer
            const newBuf = Buffer.allocUnsafe(totalBuffer - length)
            this.dataBuffer.copy(newBuf, 0, length); // everything after length
            this.dataBuffer = newBuf;
        }

        return bytesConsumed;
    }

    /**
     * Reads data from input and adds them to `#dataBuffer` until its length
     * exceeds the given length.
     * @param length Minimum amount of bytes to consume.
     * @returns The total number of bytes read. If this is less than the given
     * `length`, then there is no more data to read.
     */
    private async bufferChunks(length: number): Promise<number>
    {
        const chunks: Buffer[] = [];
        let bytesRead = 0;

        while ((this.dataBuffer?.length ?? 0) + bytesRead < length)
        {
            // add the next chunk to the data buffer
            const chunk = await this.readChunk();
            if (!chunk) break; // no more data
            chunks.push(chunk);
            bytesRead += chunk.length;
        }

        // add the chunks to the data buffer
        if (chunks.length > 0)
        {
            if (!this.dataBuffer)
            {
                this.dataBuffer = Buffer.concat(chunks, bytesRead);
            }
            else
            {
                this.dataBuffer = Buffer.concat([this.dataBuffer, ...chunks],
                    this.dataBuffer.length + bytesRead);
            }
        }

        return bytesRead;
    }

    /**
     * Gets the next chunk read from input.
     * @returns The next chunk as a Buffer, or null if no more can be consumed.
     */
    private async readChunk(): Promise<Buffer | null>
    {
        // wait for the next chunk to be read from input
        if (!this.nextChunk)
        {
            await Promise.race(
            [
                this.flushPromise,
                new Promise(
                    res => this.once(TFRecordToAExp.chunkReadEvent, res))
            ]);
        }

        // consume chunk
        const chunk = this.nextChunk;
        this.nextChunk = null;
        this.emit(TFRecordToAExp.chunkConsumedEvent);
        return chunk;
    }
}
