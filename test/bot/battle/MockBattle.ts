import { AnyMessageListener } from "../../../src/AnyMessageListener";
import { Battle, ChoiceSender } from "../../../src/bot/battle/Battle";
import { BattleState, Side } from "../../../src/bot/battle/state/BattleState";
import { PlayerID } from "../../../src/messageData";
import { MockAI } from "./ai/MockAI";

/** Mocks the Battle class to get access to certain fields. */
export class MockBattle extends Battle
{
    /**
     * Creates a MockBattle.
     * @param username Username of the client.
     * @param listener Used to listen for messages.
     * @param addResponses Sends responses to the server.
     * @param state Initial battle state.
     */
    constructor(username: string, listener: AnyMessageListener,
        sender: ChoiceSender, state: BattleState)
    {
        super(MockAI, username, /*saveAlways*/ true, listener, sender, state);
    }

    /**
     * Exposes Battle.getSide.
     * @override
     */
    public getSide(id: PlayerID): Side
    {
        return super.getSide(id);
    }
}
