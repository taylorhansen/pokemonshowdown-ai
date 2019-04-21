import { Choice } from "../../src/battle/agent/Choice";
import { BattleState } from "../../src/battle/state/BattleState";
import { RequestMessage } from "../../src/bot/dispatcher/Message";
import { ChoiceSender, PSBattle } from "../../src/bot/PSBattle";
import { Logger } from "../../src/Logger";
import { MockBattleAgent } from "./MockBattleAgent";
import { MockPSEventHandler } from "./MockPSEventHandler";

/** Mocks the PSBattle class to expose certain members. */
export class MockPSBattle extends PSBattle
{
    /** @override */
    public readonly eventHandler: MockPSEventHandler;
    /** @override */
    public readonly state: BattleState;
    /** @override */
    public lastRequest: RequestMessage;
    /** @override */
    public lastChoices: Choice[];

    /**
     * Creates a MockPSBattle.
     * @param username Client's username.
     * @param sender Used to send the BattleAgent's choice to the server.
     */
    constructor(username: string, sender: ChoiceSender)
    {
        super(username, new MockBattleAgent(), sender, Logger.null,
            MockPSEventHandler);
    }
}
