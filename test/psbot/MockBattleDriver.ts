import { BattleDriver } from "../../src/battle/driver/BattleDriver";
import { BattleState } from "../../src/battle/state/BattleState";
import { Pokemon } from "../../src/battle/state/Pokemon";
import { Side } from "../../src/battle/state/Side";
import { Team } from "../../src/battle/state/Team";

/** BattleDriver subclass that exposes protected members. */
export class MockBattleDriver extends BattleDriver
{
    /** @override */
    public readonly state!: BattleState;

    /** @override */
    public getTeam(side: Side): Team { return super.getTeam(side); }

    /** @override */
    public getMon(side: Side): Pokemon { return super.getMon(side); }

    /** @override */
    public getAllActive(): Pokemon[] { return super.getAllActive(); }
}
