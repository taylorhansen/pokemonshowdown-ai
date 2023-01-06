import {Verbose, verboseName} from "./Verbose";

/** Function type used by the Logger. */
export type LogFunc = (msg: string) => void;

/**
 * Prints log messages.
 *
 * Includes verbosity level and prefix/postfix hierarchy.
 */
export class Logger {
    /** Stdout log function. */
    public static readonly stdout: LogFunc = msg => process.stdout.write(msg);
    /** Default stderr logger. */
    public static readonly stderr: LogFunc = msg => process.stdout.write(msg);
    /** Logger function that doesn't write to anything. */
    public static readonly null: LogFunc = () => {};

    /**
     * Creates a Logger object.
     *
     * @param logFunc Function for printing logs. Default stderr.
     * @param verbose Max verbosity level. Default highest.
     * @param prefix Prefix added to each log message.
     * @param postfix Postfix added to each log message.
     */
    public constructor(
        public readonly logFunc: LogFunc = Logger.stderr,
        public readonly verbose = Verbose.Debug,
        public readonly prefix = "",
        public readonly postfix = "\n",
    ) {}

    /** Creates a new Logger with a different output. */
    public withFunc(logFunc: LogFunc): Logger {
        return new Logger(logFunc, this.verbose, this.prefix, this.postfix);
    }

    /** Creates a new Logger with a prefix appended to the current one. */
    public addPrefix(prefix: string): Logger {
        return new Logger(
            this.logFunc,
            this.verbose,
            this.prefix + prefix,
            this.postfix,
        );
    }

    /** Creates a new Logger with a postfix prepended to the current one. */
    public addPostfix(postfix: string): Logger {
        return new Logger(
            this.logFunc,
            this.verbose,
            this.prefix,
            postfix + this.postfix,
        );
    }

    /** Writes an error message. */
    public error(message: string): void {
        this.log(Verbose.Error, message);
    }

    /** Writes an informational log message. */
    public info(message: string): void {
        this.log(Verbose.Info, message);
    }

    /** Writes a developer debug message. */
    public debug(message: string): void {
        this.log(Verbose.Debug, message);
    }

    /** Writes a log message using the given verbosity level. */
    public log(verbose: Verbose, message: string): void {
        if (this.verbose < verbose) {
            return;
        }
        const name = verboseName(verbose);
        this.logFunc(`${this.prefix}${name}: ${message}${this.postfix}`);
    }
}
