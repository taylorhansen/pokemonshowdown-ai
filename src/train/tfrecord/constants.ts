/** CRC32C byte length. */
export const crcBytes = 4;
/** Metadata length number byte length. */
export const lengthBytes = 8;

/** Total bytes for the header. */
export const headerBytes = lengthBytes + crcBytes;
/** Total bytes for the footer. */
export const footerBytes = crcBytes;
