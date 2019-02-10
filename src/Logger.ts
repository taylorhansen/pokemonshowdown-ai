import { Writable } from "stream";

/** Writes debug messages to a stream. */
export class Logger
{
    /** Default stdout stream. */
    public static readonly stdout = new Logger(process.stdout);
    /** Default stderr stream. */
    public static readonly stderr = new Logger(process.stderr);
    /** Logger that doesn't do anything. */
    public static readonly null = new Logger();
    /** Stream that will be written to. */
    public readonly stream?: Writable;
    /** Prefix added to each string. */
    public readonly prefix: string;

    /**
     * Creates a Logger object.
     * @param stream Stream that will be written to.
     * @param prefix Prefix added to each string.
     */
    constructor(stream?: Writable, prefix = "")
    {
        this.stream = stream;
        this.prefix = prefix;
    }

    /**
     * Writes raw text to the stream.
     * @param message Message to write.
     */
    public print(message: string): void
    {
        if (!this.stream) return;
        this.stream.write(this.prefix + message);
    }

    /**
     * Writes text to the stream with newline.
     * @param message Message to write.
     */
    public log(message: string): void
    {
        this.print(`${message}\n`);
    }

    /**
     * Writes a normal debug message.
     * @param message Message to write.
     */
    public debug(message: string): void
    {
        this.log(`debug: ${message}`);
    }

    /**
     * Writes an error message.
     * @param message Message to write.
     */
    public error(message: string): void
    {
        this.log(`error: ${message}`);
    }
}
