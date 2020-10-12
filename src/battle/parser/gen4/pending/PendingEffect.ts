/** Represents a pending effect dependent on game events. */
export abstract class PendingEffect
{
    /**
     * Creates a PendingEffect.
     * @param chance Chance of happening. Specify if this is a secondary effect,
     * else omit it.
     */
    constructor(public readonly chance?: number | null | undefined) {}

    /** Sees if this effect matches the given arguments. */
    public abstract matches(...args: any[]): boolean;
}
