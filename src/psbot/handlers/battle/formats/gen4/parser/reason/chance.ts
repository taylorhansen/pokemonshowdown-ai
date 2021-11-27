import {inference} from "../../../../parser";
import {CallbackRegistry} from "../../../../parser/inference/CallbackRegistry";

/**
 * Creates a Reason that makes no assertions other than that the parent effect
 * is dependent on random factors outside what can be predicted or deduced.
 */
export const create = (): inference.Reason => new ChanceReason();

class ChanceReason extends inference.Reason {
    /**
     * Return value of {@link ChanceReason.canHold canHold} before or after
     * calling
     * {@link ChanceReason.assert assert}/{@link ChanceReason.reject reject}.
     */
    private held: boolean | null = null;

    private readonly cbs = new CallbackRegistry<boolean>();

    public override canHold(): boolean | null {
        return this.held;
    }

    public override assert(): void {
        this.held = true;
        this.cbs.resolve(true /*held*/);
    }

    public override reject(): void {
        this.held = false;
        this.cbs.resolve(false /*held*/);
    }

    protected override delayImpl(
        cb: inference.DelayCallback,
    ): inference.CancelCallback {
        return this.cbs.delay(cb);
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        void indentInner;
        const s = " ".repeat(indentOuter * 4);
        return `${s}ChanceReason()`;
    }
}
