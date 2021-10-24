/** Function type used by the Logger. */
export type LogFunc = (msg: string) => void;

/** Prints debug/error messages with hierarchical prefix capabilities. */
export class Logger {
    /** Default logger. */
    public static readonly default = new Logger();
    /** Default stdout logger. */
    public static readonly stdout = new Logger(undefined, msg =>
        process.stdout.write(msg),
    );
    /** Default stderr logger. */
    public static readonly stderr = new Logger(msg =>
        process.stdout.write(msg),
    );
    /** Logger that doesn't write to anything. */
    public static readonly null = new Logger(
        () => {},
        () => {},
    );

    /**
     * Creates a Logger object.
     *
     * @param debugStream Function for printing debug messages.
     * @param errorStream Function for printing error messages.
     * @param prefix Prefix added to each string.
     * @param postfix Postfix added to each string.
     */
    public constructor(
        public readonly debugLog: LogFunc = msg => process.stdout.write(msg),
        public readonly errorLog: LogFunc = msg => process.stderr.write(msg),
        public readonly prefix = "",
        public readonly postfix = "\n",
    ) {}

    /** Creates a new Logger with a prefix appended to the current one. */
    public addPrefix(prefix: string): Logger {
        return new Logger(
            this.debugLog,
            this.errorLog,
            this.prefix + prefix,
            this.postfix,
        );
    }

    /** Creates a new Logger with a postfix prepended to the current one. */
    public addPostfix(postfix: string): Logger {
        return new Logger(
            this.debugLog,
            this.errorLog,
            this.prefix,
            postfix + this.postfix,
        );
    }

    /** Creates a new Logger with a different debug printer. */
    public pipeDebug(debugLog: LogFunc): Logger {
        return new Logger(debugLog, this.errorLog, this.prefix, this.postfix);
    }

    /** Creates a new Logger with a different error printer. */
    public pipeError(errorLog: LogFunc): Logger {
        return new Logger(this.debugLog, errorLog, this.prefix, this.postfix);
    }

    /** Writes a normal debug message. */
    public debug(message: string): void {
        this.debugLog(`${this.prefix}debug: ${message}${this.postfix}`);
    }

    /** Writes an error message. */
    public error(message: string): void {
        this.errorLog(`${this.prefix}error: ${message}${this.postfix}`);
    }
}
