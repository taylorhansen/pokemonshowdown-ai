import {CancelCallback, DelayCallback, Reason} from "./Reason";

/** Creates a {@link Reason} that inverts the given one. */
export function not(reason: Reason): Reason {
    return new NotReason(reason);
}

class NotReason extends Reason {
    public constructor(private readonly reason: Reason) {
        super();
    }

    public override canHold(): boolean | null {
        const held = this.reason.canHold();
        if (held === null) return null;
        return !held;
    }

    public override assert(): void {
        this.reason.reject();
    }

    public override reject(): void {
        this.reason.assert();
    }

    protected override delayImpl(cb: DelayCallback): CancelCallback {
        return this.reason.delay(kept => cb(!kept));
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        return `\
${outer}NotReason(
${outer}${inner}reason = ${this.reason
            .toString(indentInner + 1, 0)
            .replace(/\n/g, "\n" + outer)}
${outer})`;
    }
}
