/** Readonly {@link BattleState} representation. */
export interface ReadonlyBattleState {
    /** @override */
    readonly toString: () => string;
}

/** Gen8 battle state stub. */
export class BattleState implements ReadonlyBattleState {
    /** @override */
    public toString() {
        return "<gen8 not implemented>";
    }
}
