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

    public override canHold(): boolean | null { return this.held; }

    public override assert(): void
    {
        this.held = true;
        this.delayCb?.(true /*held*/);
    }

    public override reject(): void
    {
        this.held = false;
        this.delayCb?.(false /*held*/);
    }

    protected override delayImpl(cb: inference.DelayCallback):
        inference.CancelCallback
    {
        this.delayCb = cb;
        return () => this.delayCb = null;
    }

    public override toString(indentInner = 4, indentOuter = 0): string
    {
        void indentInner;
        const s = " ".repeat(indentOuter);
        return `${s}ChanceReason()`;
    }
}

/** Function to create a {@link ChanceReason}. */
export const create = () => new ChanceReason();
