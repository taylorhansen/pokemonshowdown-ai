import { Pokemon } from "../../src/battle/state/Pokemon";
import { Side } from "../../src/battle/state/Side";
import { Team } from "../../src/battle/state/Team";
import { isPlayerID, PlayerID } from "../../src/psbot/helpers";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";
import { MockBattleDriver } from "./MockBattleDriver";

/** Mocks the PSEventHandler class to expose certain members. */
export class MockPSEventHandler extends PSEventHandler
{
    /** @override */
    public readonly driver!: MockBattleDriver;

    /** @override */
    public getMon(team: PlayerID | Side): Pokemon
    {
        if (isPlayerID(team)) team = this.getSide(team);
        return this.driver.getMon(team);
    }

    /** @override */
    public getTeam(team: PlayerID | Side): Team
    {
        if (isPlayerID(team)) team = this.getSide(team);
        return this.driver.getTeam(team);
    }

    /** @override */
    public getSide(id: PlayerID): Side { return super.getSide(id); }
}
