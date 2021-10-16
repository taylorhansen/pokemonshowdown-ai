import { inference } from "../../../../parser";

/**
 * SubReason that communicates that the parent effect is dependent on random
 * factors outside what can be predicted or deduced.
 */
export class ChanceReason extends inference.SubReason
{
    /** Value of {@link ChanceReason.canHold}. */
    private held: boolean | null = null;
    /** Callback from {@link ChanceReason.delayImpl}. */
    private delayCb: inference.DelayCallback | null = null;

    /** @override */
    public canHold(): boolean | null { return this.held; }

    /** @override */
    public assert(): void { this.held = true; this.delayCb?.(/*held*/ true); }

    /** @override */
    public reject(): void { this.held = false; this.delayCb?.(/*held*/ false); }

    /** @override */
    protected delayImpl(cb: inference.DelayCallback): inference.CancelCallback
    {
        this.delayCb = cb;
        return () => this.delayCb = null;
    }

    /** @override */
    public toString(indentInner = 4, indentOuter = 0): string
    {
        const s = " ".repeat(indentOuter);
        return `${s}ChanceReason()`;
    }
}

/** Function to create a {@link ChanceReason}. */
export const create = () => new ChanceReason();
