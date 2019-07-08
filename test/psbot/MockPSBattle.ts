import { Choice } from "../../src/battle/agent/Choice";
import { BattleState } from "../../src/battle/state/BattleState";
import { Logger } from "../../src/Logger";
import { RequestMessage } from "../../src/psbot/dispatcher/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";
import { MockBattleAgent } from "../battle/agent/MockBattleAgent";
import { MockPSEventHandler } from "./MockPSEventHandler";

/** PSBattle subclass that exposes protected members. */
export class MockPSBattle extends PSBattle
{
    /** @override */
    public readonly eventHandler!: MockPSEventHandler;
    /** @override */
    public readonly state!: BattleState;
    /** @override */
    public lastRequest?: RequestMessage;
    /** @override */
    public lastChoices!: Choice[];

    /**
     * Creates a MockPSBattle.
     * @param username Client's username.
     * @param sender Used to send the BattleAgent's choice to the server.
     */
    constructor(username: string, sender: Sender)
    {
        super(username, new MockBattleAgent(), sender, Logger.null,
            MockPSEventHandler);
    }
}
