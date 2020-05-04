import * as fs from "fs";

/** Checks if given path is an existing directory. */
async function isDir(url: fs.PathLike): Promise<boolean>
{
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(url); }
    catch (e) { return false; }
    return stat.isDirectory();
}

/** Async recursive mkdir, similar to `mkdir -p`. */
function mkdirRecursive(path: fs.PathLike): Promise<void>
{
    return new Promise((res, rej) =>
    {
        fs.mkdir(path, {recursive: true}, err => err ? rej(err) : res());
    });
}

/** Ensures that a folder exists, creating intermediate folders if needed. */
export async function ensureDir(path: fs.PathLike): Promise<void>
{
    if (!await isDir(path)) return mkdirRecursive(path);
}
