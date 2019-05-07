import { BattleState } from "../../src/battle/state/BattleState";
import { Pokemon } from "../../src/battle/state/Pokemon";
import { Side } from "../../src/battle/state/Side";
import { Team } from "../../src/battle/state/Team";
import { PlayerID } from "../../src/psbot/helpers";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";

/** Mocks the PSEventHandler class to expose certain members. */
export class MockPSEventHandler extends PSEventHandler
{
    /** @override */
    public state!: BattleState;

    /** @override */
    public getActive(team: PlayerID | Side): Pokemon
    {
        return super.getActive(team);
    }

    /** @override */
    public getTeam(team: PlayerID | Side): Team
    {
        return super.getTeam(team);
    }

    /** @override */
    public getSide(id: PlayerID): Side
    {
        return super.getSide(id);
    }
}
