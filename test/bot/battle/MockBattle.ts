import { Battle, ChoiceSender } from "../../../src/bot/battle/Battle";
import { Choice } from "../../../src/bot/battle/Choice";
import { BattleState } from "../../../src/bot/battle/state/BattleState";
import { RequestMessage } from "../../../src/bot/dispatcher/Message";
import { MessageListener } from "../../../src/bot/dispatcher/MessageListener";
import { Logger } from "../../../src/Logger";
import { MockEventProcessor } from "./MockEventProcessor";

/** Mocks the Battle class to get access to certain members. */
export class MockBattle extends Battle<MockEventProcessor>
{
    /** Expose state for easier access. */
    public get state(): BattleState { return this.processor.state; }
    /** @override */
    public processor: MockEventProcessor;
    /** @override */
    public lastRequest: RequestMessage;
    /** Last given choices. */
    public lastChoices: Choice[] = [];
    /** Whether the AI state was saved. */
    public saved = false;

    /**
     * Creates a MockBattle object.
     * @param username Client's username.
     * @param listener Used to subscribe to server messages.
     * @param sender Used to send the AI's choice to the server.
     * @param processor Type of EventProcessor to use.
     */
    constructor(username: string, listener: MessageListener,
        sender: ChoiceSender)
    {
        super(username, listener, sender, MockEventProcessor, Logger.null);
    }

    /** @override */
    public async decide(choices: Choice[]): Promise<Choice>
    {
        this.lastChoices = choices;
        return choices[0];
    }

    /** @override */
    public async save(): Promise<void>
    {
        this.saved = true;
    }
}
