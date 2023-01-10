import * as fs from "fs";
import * as path from "path";
import * as stream from "stream";
import * as tmp from "tmp-promise";
import {ensureDir} from "./paths/ensureDir";

/**
 * Wraps a deferred file write stream in case the entire file needs to be
 * discarded before doing any disk operations.
 */
export class DeferredFile {
    /** Writable stream for the possibly-deferred file. */
    public get stream(): stream.Writable {
        return this.pass;
    }
    private readonly pass = new stream.PassThrough({encoding: "utf8"});
    private file?: fs.WriteStream;

    private pipelinePromise?: Promise<void>;

    /**
     * Ensures that the log file exists.
     *
     * @param filePath Path to the file. If unspecified, then a tmp file will
     * be created.
     * @param template Template for the tmp file.
     * @returns The path to the file, either {@link filePath} if defined or a
     * tmp file otherwise.
     */
    public async ensure(filePath?: string, template?: string): Promise<string> {
        if (!this.file) {
            if (filePath) {
                await ensureDir(path.dirname(filePath));
            } else {
                filePath = (await tmp.file({template, keep: true})).path;
            }
            this.file = fs.createWriteStream(filePath);
        }
        this.pipelinePromise ??= stream.promises.pipeline(this.pass, this.file);
        // Force the promise to hold errors until finish() awaits it.
        this.pipelinePromise.catch(() => {});
        return String(this.file.path);
    }

    /**
     * Closes the file, or discards buffered data if {@link ensure} hasn't been
     * called yet.
     */
    public async finish(): Promise<void> {
        if (this.file) {
            await this.ensure();
            this.pass.end();
            await this.pipelinePromise;
            this.file.destroy();
        } else {
            this.pass.end();
        }
        this.pass.destroy();
    }
}
