/** @file Contains useful helper utilities. */

/** Type that can be null. */
export type Nullable<T> = T | null;

/** Object type where any field can be null. */
export type ShallowNullable<T> =
    {[N in keyof T]: Nullable<T[N]>};

/** Object type where any field and fields of that field can be null. */
export type DeepNullable<T> =
{
    [N in keyof T]: Nullable<T[N] extends object ? DeepNullable<T[N]> : T[N]>
};
