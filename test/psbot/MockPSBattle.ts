import { Choice } from "../../src/battle/agent/Choice";
import { BattleState } from "../../src/battle/state/BattleState";
import { Pokemon } from "../../src/battle/state/Pokemon";
import { Side } from "../../src/battle/state/Side";
import { Team } from "../../src/battle/state/Team";
import { Logger } from "../../src/Logger";
import { isPlayerID, PlayerID } from "../../src/psbot/helpers";
import { RequestMessage } from "../../src/psbot/parser/Message";
import { PSBattle } from "../../src/psbot/PSBattle";
import { Sender } from "../../src/psbot/PSBot";
import { MockBattleAgent } from "../battle/agent/MockBattleAgent";
import { MockBattleDriver } from "./MockBattleDriver";
import { MockPSEventHandler } from "./MockPSEventHandler";

/** PSBattle subclass that exposes protected members. */
export class MockPSBattle extends PSBattle
{
    /** Gets the exposed BattleState from the MockBattleDriver. */
    public get state(): BattleState { return this.driver.state; }

    /** @override */
    public readonly eventHandler!: MockPSEventHandler;
    /** @override */
    public readonly driver!: MockBattleDriver;
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
            MockBattleDriver, MockPSEventHandler);
    }

    /** Gets the active Pokemon. */
    public getMon(team: PlayerID | Side): Pokemon
    {
        if (isPlayerID(team)) team = this.getSide(team);
        return this.driver.getMon(team);
    }

    /** Gets the referenced Team. */
    public getTeam(team: PlayerID | Side): Team
    {
        if (isPlayerID(team)) team = this.getSide(team);
        return this.driver.getTeam(team);
    }

    /** Gets the player's Side. */
    public getSide(id: PlayerID): Side { return this.eventHandler.getSide(id); }
}
