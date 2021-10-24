/** Converts a display name into an id name. */
export function toIdName(str: string): string {
    return str
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}
