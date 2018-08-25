import { BattleState } from "../BattleState/BattleState";
import { Logger } from "../logger/Logger";
import { AnyMessageListener } from "./MessageListener";
import * as readline from "readline";

const rl = readline.createInterface(process.stdin, process.stdout);

/**
 * Controls the AI's actions during a battle.
 *
 * Info that the AI needs to make an informed decision:
 * * Known aspects of the opponent's team.
 * * All aspects of the AI's team.
*/
export class BattleAI
{
    /** Manages battle state and neural network input. */
    private readonly state = new BattleState();
    /** Used to send response messages to the server. */
    private readonly addResponses: (...responses: string[]) => void;

    /**
     * Creates a BattleAI object.
     * @param listener Used to subscribe to server messages.
     * @param addResponses Used to send response messages to the server.
     */
    constructor(listener: AnyMessageListener,
        addResponses: (...respones: string[]) => void)
    {
        this.addResponses = addResponses;
        listener.on("request", (team: object) =>
        {
            // fill in team info (how exactly?)
        })
        .on("switch", () =>
        {
            // switch out active pokemon and what we know about them
        })
        .on("turn", (turn: number) =>
        {
            Logger.debug(`new turn: ${turn}`)
            this.ask();
        })
        .on("error", (reason: string) =>
        {
            Logger.error(reason);
            this.ask();
        });
    }

    /** Asks for and sends user input to the server once it's received. */
    private ask(): void
    {
        rl.question("ai> ", answer =>
        {
            if (answer)
            {
                Logger.debug("received ai input");
                this.addResponses(answer);
            }
            else
            {
                Logger.error("no ai input");
            }
        });
    }
}
