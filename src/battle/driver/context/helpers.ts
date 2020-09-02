/** Deep nullable type. */
export type DeepNullable<T> =
    (T extends object ? {[K in keyof T]: DeepNullable<T[K]>} : T) |
    null | undefined;

/** Deep writable type. */
export type DeepWritable<T> =
    T extends object ? {-readonly [K in keyof T]: DeepWritable<T[K]>} : T;

/** Deep clones simple objects and arrays. */
export function deepClone<T>(obj: T): DeepWritable<T>
{
    if (!obj) return obj as DeepWritable<T>;
    return JSON.parse(JSON.stringify(obj));
}
