/** @file Buffer/TypedArray helpers. */

/**
 * Allocates a typed float32 array of the given size.
 *
 * @param size Number of elements.
 * @param mode If `"shared"`, uses a {@link SharedArrayBuffer} internally. If
 * `"unsafe"`, uses a plain {@link Buffer} but without zeroing the contents so
 * it may contain unsafe data. If unspecified then just allocates normally with
 * zeroed contents.
 * @returns A {@link Float32Array} of the given size and mode.
 */
export function alloc(size: number, mode?: "shared" | "unsafe"): Float32Array {
    switch (mode) {
        case "shared":
            return new Float32Array(
                new SharedArrayBuffer(size * Float32Array.BYTES_PER_ELEMENT),
            );
        case "unsafe": {
            const buf = Buffer.allocUnsafe(
                size * Float32Array.BYTES_PER_ELEMENT,
            );
            return new Float32Array(buf.buffer, buf.byteOffset, size);
        }
        default:
            return new Float32Array(size);
    }
}
