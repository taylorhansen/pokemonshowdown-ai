/** Verbosity level. */
export enum Verbose {
    /** No logging. */
    None = 0,
    /** Log error messages. */
    Error,
    /** Log informational messages. Includes errors. */
    Info,
    /** Log developer debug messages. Includes errors and info. */
    Debug,
}

/** Gets the name of the verbosity level. */
export function verboseName(verbose: Verbose): string {
    switch (verbose) {
        case Verbose.None:
            return "none";
        case Verbose.Error:
            return "error";
        case Verbose.Info:
            return "info";
        case Verbose.Debug:
            return "debug";
    }
}
