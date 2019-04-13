import { EventProcessor } from "../../../src/bot/battle/EventProcessor";
import { BattleState } from "../../../src/bot/battle/state/BattleState";
import { Pokemon } from "../../../src/bot/battle/state/Pokemon";
import { Side } from "../../../src/bot/battle/state/Side";
import { Team } from "../../../src/bot/battle/state/Team";
import { PlayerID } from "../../../src/bot/helpers";

/** Mocks the EventProcessor class to get access to certain members. */
export class MockEventProcessor extends EventProcessor
{
    /** @override */
    public state: BattleState;

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
