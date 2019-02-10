import { Writable } from "stream";

/** Writes debug messages to a stream. */
export class Logger
{
    /** Default stdout stream. */
    public static readonly stdout = new Logger(process.stdout);
    /** Logger that doesn't do anything. */
    public static readonly null = new Logger();
    /** Stream that will be written to. */
    public readonly stream?: Writable;

    /**
     * Creates a Logger object.
     * @param stream Stream that will be written to.
     */
    constructor(stream?: Writable)
    {
        this.stream = stream;
    }

    /**
     * Writes raw text to the stream.
     * @param message Message to write.
     */
    public print(message: string): void
    {
        if (!this.stream) return;
        this.stream.write(message);
    }

    /**
     * Writes text to the stream with newline.
     * @param message Message to write.
     */
    public log(message: string): void
    {
        this.print(message + "\n");
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
