import {CancelCallback, SubReason} from "./SubReason";

/** A possible candidate for a parent EventInference. */
export class SubInference {
    /**
     * Whether all of the {@link SubReason}s held, or `null` if currently
     * unknown.
     */
    private allHeld: boolean | null = null;
    /**
     * Whether this SubInference has to be rejected, and so must
     * {@link SubReason.reject reject} one of its {@link SubReason}s.
     */
    private rejectOne = false;

    /** Tracks the cancel callbacks of any unresolved {@link SubReason}s. */
    private readonly cancelCbs = new Set<CancelCallback>();

    private readonly accepted = new Set<SubReason>();
    private readonly rejected = new Set<SubReason>();

    /**
     * Creates a SubInference.
     *
     * @param reasons Currently unproven reasons why this SubInference should be
     * the one that is accepted by the parent EventInference. If all of them are
     * proven, the entire SubInference is proven. Otherwise if one of them is
     * disproven the entire SubInference is disproven. This Set will eventually
     * be emptied as SubReasons get resolved in the future, and so shouldn't be
     * modified outside this class.
     */
    public constructor(private readonly reasons: Set<SubReason>) {
        this.queueAll();
    }

    /**
     * Indicates that this SubInference was the one that was accepted or
     * rejected by the parent EventInference.
     *
     * This method should only be called once.
     *
     * @param accept Whether this SubInference was accepted or rejected. If
     * accepted, all of its SubReasons are proven. If rejected, one of them is
     * disproven.
     */
    public resolve(accept: boolean): void {
        // Accepted case: Prove all (remaining) SubReasons.
        if (accept) {
            for (const reason of this.reasons) reason.assert();
            // Should already be empty due to previous delay() callbacks.
            this.reasons.clear();

            // Note: If allHeld=null then all of the SubReasons were pending (if
            // any), and we just asserted them here.
            if (!this.allHeld) {
                throw new Error(
                    "Supposed to assert all SubReasons but some " +
                        `rejected; info = ${this.toString()}`,
                );
            }
            return;
        }

        // Rejected case: Start actively searching for a SubReason to reject.
        this.rejectOne = true;
        this.checkRejectOne();
    }

    /** Queues all the SubReasons to track accepts/rejects. */
    private queueAll(): void {
        // Queue up unresolved SubReasons.
        for (const reason of this.reasons) {
            let called = false;
            let calledImmediately = true;
            const cancel = reason.delay(held => {
                if (!calledImmediately) this.cancelCbs.delete(cancel);
                this.reasons.delete(reason);
                (held ? this.accepted : this.rejected).add(reason);
                called = true;
                this.update(held);
            });

            // SubReason is unresolved, queue its cancel callback in case one of
            // the others rejects.
            if (!called) {
                this.cancelCbs.add(cancel);
                calledImmediately = false;
            }
            // One of the SubReasons was already disproven, don't bother with
            // evaluating the rest.
            else if (this.allHeld === false) break;
        }
    }

    /**
     * Updates the state of this SubInference after a SubReason resolves.
     *
     * @param held Whether the SubReason in question held.
     */
    private update(held: boolean): void {
        if (!held) {
            this.allHeld = false;
            for (const cb of this.cancelCbs) cb();
        } else if (this.allHeld !== false && this.reasons.size <= 0) {
            this.allHeld = true;
        } else this.checkRejectOne();
    }

    /**
     * Checks if we should actively search for rejects in the case that this
     * SubInference is rejected.
     */
    private checkRejectOne(): void {
        // Unsure if we should actively search for rejects yet.
        if (!this.rejectOne) return;
        // Already rejected one.
        if (this.allHeld === false) return;
        // Should've rejected one by now.
        if (this.allHeld === true) {
            throw new Error(
                "Supposed to reject one SubReason but all of them held." +
                    `\nthis = ${this.toString()}`,
            );
        }

        // If all the other SubReasons accepted, then this last one must reject.
        if (this.reasons.size === 1) {
            for (const reason of this.reasons) reason.reject();
            // Should already be empty due to previous delay() callbacks.
            this.reasons.clear();
            return;
        }
        if (this.reasons.size < 1) {
            // istanbul ignore next: Should never happen.
            throw new Error(
                "All SubReasons should've been resolved by now " +
                    "(should never happen)",
            );
        }
        // In this case, not enough SubReasons have been resolved to be able to
        // make any further inferences yet.
        // Once another SubReason gets resolved, this method will be called
        // again to do another check.
    }

    /**
     * Stringifier with indent options.
     *
     * @param indentInner Number of spaces for additional indents beyond the
     * current line.
     * @param indentOuter Number of spaces for the indent of the current line.
     * @override
     */
    public toString(indentInner = 4, indentOuter = 0): string {
        const inner = " ".repeat(indentInner);
        const outer = " ".repeat(indentOuter);
        const indentReasonOuter = indentOuter + 2 * indentInner;
        return `\
${outer}SubInference(
${outer}${inner}pending = [${
            [...this.reasons]
                .map(r => "\n" + r.toString(indentInner, indentReasonOuter))
                .join(",") + (this.reasons.size > 0 ? "\n" + outer + inner : "")
        }],
${outer}${inner}accepted = [${
            [...this.accepted]
                .map(r => "\n" + r.toString(indentInner, indentReasonOuter))
                .join(",") +
            (this.accepted.size > 0 ? "\n" + outer + inner : "")
        }],
${outer}${inner}rejected = [${
            [...this.rejected]
                .map(r => "\n" + r.toString(indentInner, indentReasonOuter))
                .join(",") +
            (this.rejected.size > 0 ? "\n" + outer + inner : "")
        }]
${outer})`;
    }
}
