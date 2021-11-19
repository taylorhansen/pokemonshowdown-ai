/** @file SubReason helpers related to abilities. */
import {inference} from "../../../../parser";
import {Pokemon} from "../../state/Pokemon";
import {PossibilityClass} from "../../state/PossibilityClass";
import {subsetOrIndependent} from "./helpers";

/** Creates a SubReason that asserts that the pokemon has the given item. */
export function has(mon: Pokemon, items: Set<string>): inference.SubReason {
    return new HasItem(mon, items, false /*negative*/);
}

/**
 * Creates a SubReason that asserts that the pokemon doesn't have the given
 * item.
 */
export function doesntHave(
    mon: Pokemon,
    items: Set<string>,
): inference.SubReason {
    return new HasItem(mon, items, true /*negative*/);
}

/** Creates a SubReason that asserts that the pokemon has an unknown item. */
export function hasUnknown(mon: Pokemon): inference.SubReason {
    return doesntHave(mon, new Set(["none"]));
}

class HasItem extends inference.SubReason {
    /** Item snapshot for making inferences in retrospect. */
    private readonly item: PossibilityClass<string>;

    public constructor(
        mon: Pokemon,
        private readonly items: Set<string>,
        private readonly negative: boolean,
    ) {
        super();
        this.item = mon.item as PossibilityClass<string>;
    }

    public override canHold(): boolean | null {
        return subsetOrIndependent(
            this.items,
            this.item.possibleValues,
            this.negative,
        );
    }

    public override assert(): void {
        if (this.negative) this.rejectImpl();
        else this.acceptImpl();
    }

    public override reject(): void {
        if (this.negative) this.acceptImpl();
        else this.rejectImpl();
    }

    private acceptImpl(): void {
        // TODO: Guard against overnarrowing?
        // May need a better framework for error handling/logging.
        this.item.narrow(this.items);
    }

    private rejectImpl(): void {
        this.item.remove(this.items);
    }

    protected override delayImpl(
        cb: inference.DelayCallback,
    ): inference.CancelCallback {
        return this.item.onUpdate(
            this.items,
            this.negative ? kept => cb(!kept) : cb,
        );
    }

    public override toString(indentInner = 1, indentOuter = 0): string {
        const inner = " ".repeat(indentInner * 4);
        const outer = " ".repeat(indentOuter * 4);
        return `\
${outer}HasItem(
${outer}${inner}mon = (
${outer}${inner}${inner}item = [${this.item.toString()}],
${outer}${inner}),
${outer}${inner}items = [${[...this.items].join(", ")}],
${outer}${inner}negative = ${this.negative},
${outer})`;
    }
}
