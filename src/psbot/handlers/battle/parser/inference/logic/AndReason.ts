import {CancelCallback, DelayCallback, Reason} from "./Reason";

// TODO: Create an or/Array.some() variant and factor out common code.

/**
 * Creates a Reason that asserts all of the given sub-Reasons, like a logical
 * `and` operation or {@link Array.every `Array.every()`}.
 *
 * @param reasons Sub-Reasons to prove. If empty, then this Reason is already
 * proven.
 */
export function and(reasons: Set<Reason>): Reason {
    return new AndReason(reasons);
}

/**
 * Reason that requires all of its sub-Reasons to hold. Essentially a logical
 * `and` operation or `Array.every()`.
 */
class AndReason extends Reason {
    /**
     * Whether all of the {@link Reason}s held, or `null` if currently unknown.
     */
    private get allHeld(): boolean | null {
        return this._allHeld;
    }
    private set allHeld(value: boolean | null) {
        if (value === this._allHeld) return;
        if (value !== null) {
            if (this._allHeld === null) {
                this._allHeld = value;
                // Resolve pending delay callbacks.
                for (const cb of this.delayCbs.values()) cb(value);
                this.delayCbs.clear();
                return;
            }
        }
        throw new Error(
            `Invalid set allHeld: old = ${this._allHeld}, new = ${value}`,
        );
    }
    private _allHeld: boolean | null = null;
    /**
     * Whether this AndReason has to be rejected, and so must
     * {@link Reason.reject reject} one of its {@link Reason}s.
     */
    private rejectOne = false;

    private readonly accepted = new Set<Reason>();
    private readonly rejected = new Set<Reason>();

    private delayUid = 0;
    private readonly delayCbs = new Map<number, DelayCallback>();

    /**
     * Creates an AndReason.
     *
     * @param reasons Sub-Reasons to prove. If empty, then this AndReason is
     * already proven.
     */
    public constructor(private readonly reasons: Set<Reason>) {
        super();

        if (this.reasons.size <= 0) {
            this.allHeld = true;
            return;
        }

        // Queue up unresolved Reasons.
        const cancelCbs = new Set<CancelCallback>();
        for (const reason of this.reasons) {
            let called = false;
            const cancel = reason.delay(held => {
                // Status of Reason is now known.
                // Categorize the Reason as accepted or rejected.
                this.reasons.delete(reason);
                (held ? this.accepted : this.rejected).add(reason);
                called = true;
                if (!held) {
                    // Rejected, so this AndReason failed.
                    this.allHeld = false;
                    for (const cb of cancelCbs) cb();
                    cancelCbs.clear();
                } else if (this.allHeld !== false && this.reasons.size <= 0) {
                    // All previous have accepted, and we just accepted the last
                    // one.
                    this.allHeld = true;
                } else this.checkRejectOne();
            });
            // Reason is unresolved, queue its cancel callback in case one of
            // the others rejects.
            if (!called) cancelCbs.add(cancel);
            // One of the Reasons was already disproven, so don't bother with
            // evaluating the rest.
            else if (this.allHeld === false) break;
        }
    }

    public override canHold(): boolean | null {
        return this.allHeld;
    }

    public override assert(): void {
        // Prove all (remaining) sub-Reasons.
        for (const reason of this.reasons) reason.assert();
        // Note: Should already be empty due to previous delay() callbacks.
        this.reasons.clear();

        if (!this.allHeld) {
            throw new Error(
                "Supposed to assert all Reasons but some rejected." +
                    `\nthis = ${this.toString()}`,
            );
        }
    }

    public override reject(): void {
        // Start actively searching for a Reason to reject.
        this.rejectOne = true;
        this.checkRejectOne();
    }

    protected override delayImpl(cb: DelayCallback): CancelCallback {
        const uid = this.delayUid++;
        this.delayCbs.set(uid, cb);
        return () => this.delayCbs.delete(uid);
    }

    /**
     * Checks if we should actively search for rejects in the case that this
     * AndReason is rejected.
     */
    private checkRejectOne(): void {
        // Unsure if we should actively search for rejects yet.
        if (!this.rejectOne) return;
        // Already rejected one.
        if (this.allHeld === false) return;
        // Should've rejected one by now.
        if (this.allHeld === true) {
            throw new Error(
                "Supposed to reject one Reason but all of them held." +
                    `\nthis = ${this.toString()}`,
            );
        }

        // If all the other Reasons accepted, then this last one must reject.
        if (this.reasons.size === 1) {
            for (const reason of this.reasons) reason.reject();
            // Note: Should already be empty due to previous delay() callbacks
            // but just in case.
            this.reasons.clear();
            return;
        }
        if (this.reasons.size < 1) {
            // istanbul ignore next: Should never happen.
            throw new Error(
                "All Reasons should've been resolved by now " +
                    `(should never happen)\nthis = ${this.toString()}`,
            );
        }
        // In this case, not enough Reasons have been resolved to be able to
        // make any further inferences yet.
        // Once another Reason gets resolved, this method will be called
        // again to do another check.
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        const indentReasonOuter = indentOuter + 2 * indentInner;
        return `\
${outer}AndReason(
${outer}${inner}pending = [${
            [...this.reasons]
                .map(r => `\n${r.toString(indentInner, indentReasonOuter)},`)
                .join("") + (this.reasons.size > 0 ? "\n" + outer + inner : "")
        }],
${outer}${inner}accepted = [${
            [...this.accepted]
                .map(r => `\n${r.toString(indentInner, indentReasonOuter)},`)
                .join("") + (this.accepted.size > 0 ? "\n" + outer + inner : "")
        }],
${outer}${inner}rejected = [${
            [...this.rejected]
                .map(r => `\n${r.toString(indentInner, indentReasonOuter)},`)
                .join("") + (this.rejected.size > 0 ? "\n" + outer + inner : "")
        }],
${outer})`;
    }
}
