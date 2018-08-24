import { Logger } from "../logger/Logger";
import { AnyMessageListener } from "./MessageListener";

/** Differentiates between the AI and the opponent. */
export type Owner = "us" | "them";

/**
 * Controls the AI's actions during a battle.
 *
 * Info that the AI needs to make an informed decision:
 * * Known aspects of the opponent's team.
 * * All aspects of the AI's team.
*/
export class BattleAI
{
    /**
     * Holds the two player ids and tells which one symbolizes the AI or the
     * opponent.
     */
    private readonly players: {[id: string]: Owner};
    private readonly teams: {[owner: string]: null[]};

    /**
     * Creates a BattleAI object.
     * @param listener Used to subscribe to certain messages.
     */
    constructor(listener: AnyMessageListener)
    {
        this.players = {};
        this.teams = {};
        listener.on("request", (team: object) =>
        {
            // fill in team info (how exactly?)
            Logger.debug("request!");
        })
        .on("switch", (team: object) =>
        {
            // switch out active pokemon and what we know about them
            Logger.debug("switch!");
        });
    }
}
