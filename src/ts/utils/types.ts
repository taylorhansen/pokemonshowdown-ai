export type Mutable<T> = {
    -readonly [U in keyof T]: T[U];
};
