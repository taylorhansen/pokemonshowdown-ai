import { Logger } from "../logger/Logger";
import { MessageParser } from "./MessageParser";

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
     * @param room Room where the battle takes place.
     * @param parser Used to subscribe to certain messages.
     */
    constructor(room: string, parser: MessageParser)
    {
        this.players = {};
        this.teams = {};
        parser.on("request", (team: object) =>
        {
            // FIXME: use a hash listener lookup based on room?
            if (parser.room === room)
            {
                // fill in team info (how exactly?)
                Logger.debug("request!");
            }
        })
        .on("switch", (team: object) =>
        {
            if (parser.room === room)
            {
                // switch out active pokemon and what we know about them
                Logger.debug("switch!");
            }
        });
    }
}
