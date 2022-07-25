import * as crypto from "crypto";

/**
 * Hashes a string.
 *
 * @param str Input string.
 * @param algorithm Hash algorithm to use.
 * @param inputEncoding Encoding of the input string.
 * @param outputEncoding Encoding of the output string.
 */
export const hash = (
    str: string,
    algorithm = "md5",
    inputEncoding: crypto.Encoding = "utf8",
    outputEncoding: crypto.BinaryToTextEncoding = "hex",
): string =>
    crypto
        .createHash(algorithm)
        .update(str, inputEncoding)
        .digest(outputEncoding);
