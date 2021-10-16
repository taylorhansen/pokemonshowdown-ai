import { Args, Protocol } from "@pkmn/protocol";
import { Event } from "../../parser";
import { RoomHandler } from "../RoomHandler";

/**
 * Handles global PS messages such as login/initialization and PMs/challenges.
 */
export class GlobalHandler implements RoomHandler, Protocol.Handler
{
    /** Callback to update the client's username. */
    public updateUser: ((username: Protocol.Username) => void) | null = null;
    /** Callback to receive a battle challenge from another user. */
    public respondToChallenge: ((user: string, format: string) => void) | null =
        null;

    /** Promise to get the login challstr. */
    public readonly challstr: Promise<string>;
    private challstrRes: ((challstr: string) => void) | null = null;

    private username: Protocol.Username | null = null;

    constructor()
    {
        this.challstr = new Promise<string>(res => this.challstrRes = res)
            .finally(() => this.challstrRes = null);
    }

    /** @override */
    public handle(event: Event): void
    {
        const key = Protocol.key(event.args);
        if (!key) return;
        ((this as Protocol.Handler)[key] as any)?.(event.args, event.kwArgs);
    }

    /** @override */
    public halt(): void {}

    // list taken from Protocol.GlobalArgs

    "|popup|"(args: Args["|popup|"]) {}
    "|pm|"(args: Args["|pm|"])
    {
        const [, sender, recipient, msg] = args;
        if (msg.startsWith("/challenge"))
        {
            if (!this.respondToChallenge) return;
            if (!this.username) return;
            const r = recipient.trim() as any;
            if (r !== this.username) return;
            const s = sender.trim() as any;
            if (s === this.username) return;
            const i = msg.indexOf("|");
            if (i < 0) return;
            const format = msg.substring("/challenge".length, i).trim();
            this.respondToChallenge(s, format);
        }
    }
    "|usercount|"(args: Args["|usercount|"]) {}
    "|nametaken|"(args: Args["|nametaken|"]) {}
    "|challstr|"(args: Args["|challstr|"])
    {
        if (!this.challstrRes) throw new Error("Received a second challstr");
        this.challstrRes(args[1]);
    }
    "|updateuser|"(args: Args["|updateuser|"])
    {
        this.username = args[1].trim() as Protocol.Username;
        this.updateUser?.(this.username);
    }
    "|formats|"(args: Args["|formats|"]) {}
    "|updatesearch|"(args: Args["|updatesearch|"]) {}
    "|updatechallenges|"(args: Args["|updatechallenges|"])
    {
        if (!this.respondToChallenge) return;

        const json = Protocol.parseChallenges(args[1]);
        for (const [user, format] of Object.entries(json.challengesFrom))
        {
            this.respondToChallenge(user, format);
        }
    }
    "|queryresponse|"(args: Args["|queryresponse|"]) {}
}
