import {CallbackRegistry} from "./CallbackRegistry";
import {CancelCallback, DelayCallback, Reason} from "./Reason";

/**
 * Creates a {@link Reason} that asserts all of the given sub-Reasons, like a
 * logical `and` operation or {@link Array.every `Array.every()`}.
 *
 * Note that this might not work well if two or more sub-Reasons depend on the
 * same underlying data, since the Reason interface abstracts that out for now.
 *
 * @param reasons Sub-Reasons to prove. If empty, then this Reason is already
 * proven.
 */
export function and(reasons: Set<Reason>): Reason {
    return new AndOrReason(reasons, "and");
}

/**
 * Creates a {@link Reason} that asserts at least one of the given sub-Reasons,
 * like a logical `or` operation or {@link Array.some `Array.some()`}.
 *
 * Note that this might not work well if two or more sub-Reasons depend on the
 * same underlying data, since the Reason interface abstracts that out for now.
 *
 * @param reasons Sub-Reasons, at least one of which to prove. If empty, then
 * this Reason is already disproven.
 */
export function or(reasons: Set<Reason>): Reason {
    return new AndOrReason(reasons, "or");
}

type AndOrMode = "and" | "or";

// Note: Comments that say "assert/reject" mean "assert" if the mode is "and"
// and "reject" if the mode is "or".
/**
 * Reason that requires all (in `and` mode) or at least one (in `or` mode) of
 * its sub-Reasons to hold.
 *
 * Essentially an `Array.every()` (in `and` mode) or `Array.some()` (in `or`
 * mode).
 */
class AndOrReason extends Reason {
    /**
     * Whether this Reason holds, or `null` if currently unknown.
     */
    private get held(): boolean | null {
        return this._held;
    }
    private set held(value: boolean | null) {
        if (value === this._held) return;
        if (value !== null) {
            if (this._held === null) {
                this._held = value;
                // Resolve pending delay callbacks.
                this.cbs.resolve(value);
                return;
            }
        }
        throw new Error(
            `Invalid set held: old = ${this._held}, new = ${value}`,
        );
    }
    private _held: boolean | null = null;

    /** Whether to actively search for rejects/asserts. */
    private searching = false;

    private readonly accepted = new Set<Reason>();
    private readonly rejected = new Set<Reason>();

    private readonly cbs = new CallbackRegistry<boolean>();

    /**
     * Creates an AndOrReason.
     *
     * @param reasons Sub-Reasons to prove or disprove.
     * @param mode Whether this AndOrReason is an `and` or `or` operation.
     */
    public constructor(
        private readonly reasons: Set<Reason>,
        private readonly mode: AndOrMode,
    ) {
        super();

        if (this.reasons.size <= 0) {
            this.held = mode === "and";
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
                if (held === (this.mode !== "and")) {
                    // Rejected/accepted, so this Reason failed/succeeded.
                    this.held = this.mode !== "and";
                    for (const cb of cancelCbs) cb();
                    cancelCbs.clear();
                } else if (
                    this.held !== (this.mode !== "and") &&
                    this.reasons.size <= 0
                ) {
                    // All previous asserted/rejected, and this is the last one.
                    this.held = this.mode === "and";
                } else this.checkSearch();
            });
            // Reason is unresolved, queue its cancel callback in case one of
            // the others rejects/asserts.
            if (!called) cancelCbs.add(cancel);
            // Already rejected/accepted one, so don't bother with the rest
            // (short circuit).
            else if (this.held === (this.mode !== "and")) break;
        }
    }

    public override canHold(): boolean | null {
        return this.held;
    }

    public override assert(): void {
        if (this.mode === "and") {
            this.proveAll();
        } else {
            this.searching = true;
            this.checkSearch();
        }
    }

    public override reject(): void {
        if (this.mode === "and") {
            this.searching = true;
            this.checkSearch();
        } else {
            this.proveAll();
        }
    }

    /** Proves/disproves all remaining sub-Reasons. */
    private proveAll(): void {
        for (const reason of this.reasons) {
            reason[this.mode === "and" ? "assert" : "reject"]();
        }
        // Note: If this.held is null, then there are some more complicated
        // Reasons further down the chain (e.g. another AndOrReason) that aren't
        // fully able to assert/reject just yet but should eventually resolve to
        // the correct truth value now that the appropriate method was just
        // called.
        if (this.held === (this.mode !== "and")) {
            throw new Error(
                `Supposed to ${this.mode === "and" ? "assert" : "reject"} ` +
                    "all Reasons but some " +
                    `${this.mode === "and" ? "rejected" : "asserted"}.` +
                    `\nthis = ${this.toString()}`,
            );
        }
    }

    protected override delayImpl(cb: DelayCallback): CancelCallback {
        return this.cbs.delay(cb);
    }

    /**
     * Checks if we should actively search for rejects/asserts in the case that
     * this Reason is rejected/asserted.
     */
    private checkSearch(): void {
        // Unsure if we should actively search for asserts yet.
        if (!this.searching) return;
        // Already rejected/asserted one.
        if (this.held === (this.mode !== "and")) return;
        // Should've rejected/asserted one by now.
        if (this.held === (this.mode === "and")) {
            throw new Error(
                `Supposed to ${this.mode === "and" ? "reject" : "assert"} ` +
                    "one Reason but all of them " +
                    `${this.mode === "and" ? "asserted" : "rejected"}.` +
                    `\nthis = ${this.toString()}`,
            );
        }

        // If all the other Reasons asserted/rejected, then this last one must
        // reject/assert.
        if (this.reasons.size === 1) {
            for (const reason of this.reasons) {
                reason[this.mode === "and" ? "reject" : "assert"]();
            }
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
${outer}${this.mode === "and" ? "And" : "Or"}Reason(
${outer}${inner}held = ${this.held}\
${this.searching ? ` (${this.mode === "and" ? "reject" : "assert"}ing)` : ""},
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
