/** @file Buffer/TypedArray helpers. */

/**
 * Allocates a typed array suitable for the given Encoder. Its contents are
 * zeroed out.
 *
 * @param size Byte size.
 * @param shared Whether to use a SharedArrayBuffer for the array.
 */
export function alloc(size: number, shared = false): Float32Array
{
    if (!shared) return new Float32Array(size);
    return new Float32Array(
        new SharedArrayBuffer(size * Float32Array.BYTES_PER_ELEMENT));
}

/**
 * Allocates a typed array suitable for the given Encoder. Its contents are not
 * zeroed out, and may contain sensitive data.
 *
 * @param size Byte size.
 */
export function allocUnsafe(size: number): Float32Array
{
    // Unsafe allocation lets us not have to zero out the contents.
    const buf = Buffer.allocUnsafe(size * Float32Array.BYTES_PER_ELEMENT);
    return new Float32Array(buf.buffer, buf.byteOffset, size);
}
