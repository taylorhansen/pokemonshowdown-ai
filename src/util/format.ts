/** Gets the number of whole decimal digits in a number. */
export function numDigits(n: number): number {
    if (n === 0) {
        return 1;
    }
    return 1 + Math.floor(Math.log10(Math.abs(n)));
}

/** Formats a {@link process.uptime} value. */
export function formatUptime(seconds: number): string {
    seconds = Math.floor(seconds);
    let s = "";
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= 24 * 60 * 60;
    if (days > 0) {
        s += `${days}d`;
    }
    const hours = Math.floor(seconds / (60 * 60));
    seconds %= 60 * 60;
    if (s.length > 0) {
        s += String(hours).padStart(2, "0") + "h";
    } else if (hours > 0) {
        s += String(hours) + "h";
    }
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    if (s.length > 0) {
        s += String(minutes).padStart(2, "0") + "m";
    } else if (minutes > 0) {
        s += String(minutes) + "m";
    }
    if (s.length > 0) {
        s += String(seconds).padStart(2, "0") + "s";
    } else {
        s += String(seconds) + "s";
    }
    return s;
}
