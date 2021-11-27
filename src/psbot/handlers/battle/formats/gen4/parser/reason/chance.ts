import {inference} from "../../../../parser";

/**
 * Creates a Reason that makes no assertions other than that the parent effect
 * is dependent on random factors outside what can be predicted or deduced.
 */
export const create = (): inference.logic.Reason => new ChanceReason();

class ChanceReason extends inference.logic.Reason {
    /**
     * Return value of {@link ChanceReason.canHold canHold} before or after
     * calling
     * {@link ChanceReason.assert assert}/{@link ChanceReason.reject reject}.
     */
    private held: boolean | null = null;
    /** Callback from {@link ChanceReason.delayImpl delayImpl}. */
    private delayCb: inference.logic.DelayCallback | null = null;

    public override canHold(): boolean | null {
        return this.held;
    }

    public override assert(): void {
        this.held = true;
        this.delayCb?.(true /*held*/);
    }

    public override reject(): void {
        this.held = false;
        this.delayCb?.(false /*held*/);
    }

    protected override delayImpl(
        cb: inference.logic.DelayCallback,
    ): inference.logic.CancelCallback {
        this.delayCb = cb;
        return () => (this.delayCb = null);
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        void indentInner;
        const s = " ".repeat(indentOuter * 4);
        return `${s}ChanceReason()`;
    }
}
