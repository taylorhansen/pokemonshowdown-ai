export type DeepReadonlyPartial<T> = T extends object
    ? {
          readonly [P in keyof T]?: DeepReadonlyPartial<T[P]>;
      }
    : T;
