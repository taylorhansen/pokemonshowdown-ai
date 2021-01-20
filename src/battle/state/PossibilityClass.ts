/** Readonly PossibilityClass representation. */
export interface ReadonlyPossibilityClass<TKey extends string, TData = any>
{
    /** Maps value name to data. */
    readonly map: {readonly [K in TKey]: TData};
    /** The set of possible values this object can be. */
    readonly possibleValues: ReadonlySet<TKey>;
    /** Gets the class name if narrowed down sufficiently, otherwise null. */
    readonly definiteValue: TKey | null;

    /**
     * Adds a listener for when this object gets fully narrowed. The provided
     * function can be immediately called if this PossibilityClass is already
     * narrowed.
     */
    then(f: (key: TKey, data: TData) => void): this;

    /** Checks if a value is in the data possibility. */
    isSet(name: TKey): boolean;
}

/**
 * Represents a set of possible values. This can be used in place of the actual
 * value when the actual value can be one of many possible values.
 */
export class PossibilityClass<TKey extends string, TData = any> implements
    ReadonlyPossibilityClass<TKey, TData>
{
    /** @override */
    public readonly map: {readonly [T in TKey]: TData};

    /** @override */
    public get possibleValues(): ReadonlySet<TKey>
    {
        return this._possibleValues;
    }
    private readonly _possibleValues: Set<TKey>;

    /**
     * Gets the class name and data if narrowed down sufficiently, otherwise
     * null.
     */
    public get definiteValue(): TKey | null { return this._definiteValue; }
    private _definiteValue: TKey | null = null;

    /** `#then()` listeners. */
    private readonly listeners: ((key: TKey, data: TData) => void)[] = [];

    /**
     * Creates a PossibilityClass.
     * @param map Base dictionary object. Should not change during the lifetime
     * of this object.
     * @param values Optional values to immediately narrow to. Defaults to all
     * possible values given by the `map`.
     */
    constructor(map: {readonly [T in TKey]: TData}, ...values: string[]);
    /**
     * Creates a PossibilityClass.
     * @param map Base dictionary object. Should not change during the lifetime
     * of this object.
     * @param values Optional values to immediately narrow to if not empty.
     * Defaults to all possible values given by the `map`.
     */
    constructor(map: {readonly [T in TKey]: TData},
        values: readonly string[] | ReadonlySet<string>);
    constructor(map: {readonly [T in TKey]: TData},
        arg1?: string | readonly string[] | ReadonlySet<string>,
        ...values: string[])
    {
        this.map = map;

        let set: Set<TKey> | undefined;
        if (typeof arg1 === "string")
        {
            this.check(arg1);
            for (const v of values) this.check(v);
            values.push(arg1);
            set = new Set(values as TKey[]);
        }
        else if (typeof arg1 !== "undefined")
        {
            for (const v of arg1) this.check(v);
            set = new Set(arg1 as readonly TKey[] | ReadonlySet<TKey>);
        }

        if (!set || set.size <= 0) set = new Set(Object.keys(map) as TKey[]);
        this._possibleValues = set;

        this.checkNarrowed();
    }

    /** Checks that a given name is part of this object's map. */
    private check(name: string): asserts name is TKey
    {
        if (!this.map.hasOwnProperty(name))
        {
            throw new Error(`PossibilityClass has no value name '${name}'`);
        }
    }

    /** @override */
    public then(f: (key: TKey, data: TData) => void): this
    {
        this.listeners.push(f);
        this.checkNarrowed();
        return this;
    }

    /** @override */
    public isSet(name: TKey): boolean
    {
        return this._possibleValues.has(name);
    }

    /** Removes keys that are not in the given array. */
    public narrow(...values: string[]): void;
    /** Removes keys that are not in the given Set/array. */
    public narrow(values: readonly string[] | ReadonlySet<string>): void;
    /** Removes keys that don't satisfy the given predicate. */
    // tslint:disable-next-line: unified-signatures
    public narrow(pred: (name: TKey, data: TData) => boolean): void;
    public narrow(
        arg0?: string | readonly string[] | ReadonlySet<string> |
            ((name: TKey, data: TData) => boolean),
        ...values: string[]): void
    {
        if (typeof arg0 === "undefined")
        {
            // over-narrow to 0 keys to trigger error
            this._possibleValues.clear();
            return this.checkNarrowed();
        }
        if (typeof arg0 === "string")
        {
            values.push(arg0);
            return this.narrow(new Set(values));
        }
        if (Array.isArray(arg0)) return this.narrow(new Set(arg0));
        if (arg0 instanceof Set) return this.narrow(n => arg0.has(n));

        // filter based on predicate
        // TODO: should overnarrowing errors be recovered from? many callers
        //  guard against it anyway
        const pred = arg0 as (name: TKey, data: TData) => boolean;
        for (const name of this._possibleValues)
        {
            if (!pred(name, this.map[name])) this._possibleValues.delete(name);
        }
        this.checkNarrowed();
    }

    /** Removes keys if they are included in the given array. */
    public remove(...values: string[]): void
    /** Removes keys if they are included in the given Set/array. */
    public remove(values: readonly string[] | ReadonlySet<string>): void
    /** Removes keys if they satisfy the predicate. */
    // tslint:disable-next-line: unified-signatures
    public remove(pred: (name: TKey, data: TData) => boolean): void;
    public remove(
        arg0?: string | readonly string[] | ReadonlySet<string> |
            ((name: TKey,  data: TData) => boolean),
        ...values: string[]): void
    {
        if (typeof arg0 === "undefined") return;
        if (typeof arg0 === "string")
        {
            values.push(arg0);
            return this.remove(new Set(values));
        }
        if (Array.isArray(arg0)) return this.remove(new Set(arg0));
        if (arg0 instanceof Set) return this.remove(n => arg0.has(n));

        // filter based on predicate
        const pred = arg0 as (name: TKey, data: TData) => boolean;
        for (const name of this._possibleValues)
        {
            if (pred(name, this.map[name])) this._possibleValues.delete(name);
        }
        this.checkNarrowed();
    }

    /**
     * Handles setting `#definiteValue` and calling narrow listeners whenever
     * the base `#possibleValues` set changes.
     */
    private checkNarrowed(): void
    {
        const size = this._possibleValues.size;
        if (size === 1)
        {
            if (!this._definiteValue)
            {
                this._definiteValue =
                    this._possibleValues.values().next().value;
            }
            this.narrowed();
        }
        else if (size < 1)
        {
            throw new Error("All possibilities have been ruled out (should " +
                "never happen)");
        }
        else this._definiteValue = null;
    }

    /** Calls all `#then()` listeners. */
    private narrowed(): void
    {
        if (!this._definiteValue) return;

        const data = this.map[this._definiteValue];
        while (this.listeners.length > 0)
        {
            this.listeners.shift()!(this._definiteValue, data);
        }
    }

    // istanbul ignore next: only used for logging
    /**
     * Returns a comma-separated list of each possible value.
     * @override
     */
    public toString(): string
    {
        return [...this._possibleValues].join(", ");
    }
}
