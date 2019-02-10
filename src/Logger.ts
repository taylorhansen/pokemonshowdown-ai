import { Writable } from "stream";

/** Writes debug messages to a stream. */
export class Logger
{
    /** Default stdout stream. */
    public static readonly stdout = new Logger(process.stdout);
    /** Logger that doesn't do anything. */
    public static readonly null = new Logger();
    /** Stream that will be written to. */
    private readonly stream?: Writable;

    /**
     * Creates a Logger object.
     * @param stream Stream that will be written to.
     */
    constructor(stream?: Writable)
    {
        this.stream = stream;
    }

    /**
     * Writes a normal debug message.
     * @param message Message to write.
     */
    public debug(message: string): void
    {
        if (!this.stream) return;
        message = `debug: ${message}\n`;
        this.stream.write(message);
    }

    /**
     * Writes an error message.
     * @param message Message to write.
     */
    public error(message: string): void
    {
        if (!this.stream) return;
        message = `error: ${message}\n`;
        this.stream.write(message);
    }

    public clearLastLine(): void
    {
        if (!this.stream) return;
    }
}
