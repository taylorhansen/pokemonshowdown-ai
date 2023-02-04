import * as fs from "fs";

/**
 * Ensures that a folder exists, creating intermediate folders if needed.
 * Returns the provided path.
 */
export async function ensureDir<T extends fs.PathLike>(path: T): Promise<T> {
    let isDirectory: boolean;
    try {
        const stat = await fs.promises.stat(path);
        isDirectory = stat.isDirectory();
    } catch (e) {
        isDirectory = false;
    }
    if (!isDirectory) {
        await fs.promises.mkdir(path, {recursive: true});
    }
    return path;
}
