import * as fs from "fs";

/** Ensures that a folder exists, creating intermediate folders if needed. */
export async function ensureDir(path: fs.PathLike): Promise<void> {
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
}
