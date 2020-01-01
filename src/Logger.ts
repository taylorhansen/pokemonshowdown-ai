import ProgressBar from "progress";
import { Writable } from "stream";

/** Writes debug/error messages to a stream. */
export class Logger
{
    /** Default logger. */
    public static readonly default = new Logger();
    /** Default stdout logger. */
    public static readonly stdout = new Logger(process.stdout, process.stdout);
    /** Default stderr logger. */
    public static readonly stderr = new Logger(process.stderr, process.stderr);
    /** Logger that doesn't write to anything. */
    public static readonly null = new Logger(null, null);

    /** Stream to write debug messages to. */
    public readonly debugStream: Writable | null;
    /** Stream to write error messages to. */
    public readonly errorStream: Writable | null;

    /** Prefix added to the beginning of each message. */
    private readonly _prefix: string;
    /** Postfix added to the end of each message. */
    private readonly _postfix: string;

    /**
     * Creates a Logger object.
     * @param debugStream Stream to write debug messages to.
     * @param errorStream Stream to write error messages to.
     * @param prefix Prefix added to each string.
     * @param newline Whether to add a newline to the end of messages.
     */
    constructor(debugStream: Writable | null = process.stdout,
        errorStream: Writable | null = process.stderr, prefix = "",
        postfix = "\n")
    {
        this.debugStream = debugStream;
        this.errorStream = errorStream;
        this._prefix = prefix;
        this._postfix = postfix;
    }

    /** Creates a new Logger with a prefix appended to the current one. */
    public prefix(prefix: string): Logger
    {
        return new Logger(this.debugStream, this.errorStream,
            this._prefix + prefix, this._postfix);
    }

    // TODO: remove unused method postfix
    /** Creates a new Logger with a postfix appended to the current one. */
    public postfix(postfix: string): Logger
    {
        return new Logger(this.debugStream, this.errorStream,
            this._prefix, this._postfix + postfix);
    }

    /** Creates a new Logger with a different debug stream. */
    public pipeDebug(stream: Writable | null): Logger
    {
        return new Logger(stream, this.errorStream, this._prefix,
            this._postfix);
    }

    /** Creates a new Logger with a different error stream. */
    public pipeError(stream: Writable | null): Logger
    {
        return new Logger(this.debugStream, stream, this._prefix,
            this._postfix);
    }

    /**
     * Creates a new Logger that uses `ProgressBar#interrupt()` to prevent
     * interference with it in place of the usual `#debug()` behavior.
     */
    public progressDebug(bar: ProgressBar): Logger
    {
        if (!this.debugStream) return this;
        return this.pipeDebug(this.getLogStream(bar));
    }

    /**
     * Creates a new Logger that uses `ProgressBar#interrupt()` to prevent
     * interference with it in place of the usual `#error()` behavior.
     */
    public progressError(bar: ProgressBar): Logger
    {
        if (!this.errorStream) return this;
        return this.pipeDebug(this.getLogStream(bar));
    }

    /**
     * Creates a Writable that uses `ProgressBar#interrupt()` in place of the
     * usual `#write()` behavior.
     */
    private getLogStream(bar: ProgressBar): Writable
    {
        // TODO: replace Writable with just a function since the only method
        //  that the Logger actually uses is write()
        const logStream = new Writable();
        type CB = (error: Error | null | undefined) => void;
        // overwrite the write method in order to insert bar functionality
        logStream.write = function(chunk: any, enc?: string | CB, cb?: CB)
        {
            // remove last newline, since ProgressBar#interrupt() adds it
            if (typeof chunk === "string" && chunk.endsWith("\n"))
            {
                chunk = chunk.substr(0, chunk.length - 1);
            }
            bar.interrupt(chunk);
            if (cb) cb(null);
            return true;
        };
        return logStream;
    }

    /** Writes a normal debug message. */
    public debug(message: string): void
    {
        if (!this.debugStream) return;
        this.debugStream.write(
            `${this._prefix}debug: ${message}${this._postfix}`);
    }

    /** Writes an error message. */
    public error(message: string): void
    {
        if (!this.errorStream) return;
        this.errorStream.write(
            `${this._prefix}error: ${message}${this._postfix}`);
    }
}
