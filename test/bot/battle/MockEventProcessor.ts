import { EventProcessor } from "../../../src/bot/battle/EventProcessor";
import { BattleState } from "../../../src/bot/battle/state/BattleState";
import { Side } from "../../../src/bot/battle/state/Side";
import { PlayerID } from "../../../src/bot/helpers";

/** Mocks the EventProcessor class to get access to certain members. */
export class MockEventProcessor extends EventProcessor
{
    /** @override */
    public state: BattleState;

    /** @override */
    public getSide(id: PlayerID): Side
    {
        return super.getSide(id);
    }
}
