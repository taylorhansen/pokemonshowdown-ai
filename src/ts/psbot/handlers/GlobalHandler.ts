/* eslint-disable @typescript-eslint/naming-convention */
import {Args, Protocol} from "@pkmn/protocol";
import {Event} from "../../protocol/Event";
import {RoomHandler} from "./RoomHandler";

/**
 * Handles global PS messages such as login/initialization and PMs/challenges.
 */
export class GlobalHandler implements RoomHandler, Protocol.Handler {
    /** Callback to update the client's username. */
    public updateUser: ((username: Protocol.Username) => void) | null = null;
    /** Callback to receive a battle challenge from another user. */
    public respondToChallenge: ((user: string, format: string) => void) | null =
        null;

    /** Promise to get the login challstr. */
    public readonly challstr: Promise<string>;
    private challstrRes: ((challstr: string) => void) | null = null;

    private username: Protocol.Username | null = null;

    /** Creates a GlobalHandler. */
    public constructor() {
        this.challstr = new Promise<string>(
            res => (this.challstrRes = res),
        ).finally(() => (this.challstrRes = null));
    }

    /** @override */
    public handle(event: Event): void {
        const key = Protocol.key(event.args);
        if (!key) {
            return;
        }
        (
            (this as Protocol.Handler)[key] as (
                args: Event["args"],
                kwArgs: Event["kwArgs"],
            ) => void
        )?.(event.args, event.kwArgs);
    }

    /** @override */
    public halt(): void {}

    /** @override */
    public finish(): void {}

    // List taken from Protocol.GlobalArgs.

    public "|popup|"(args: Args["|popup|"]) {
        void args;
    }
    public "|pm|"(args: Args["|pm|"]) {
        const [, sender, recipient, msg] = args;
        if (msg.startsWith("/challenge")) {
            if (!this.respondToChallenge || !this.username) {
                return;
            }
            const r = recipient.trim() as Protocol.Username;
            if (r !== this.username) {
                return;
            }
            const s = sender.trim() as Protocol.Username;
            if (s === this.username) {
                return;
            }
            const i = msg.indexOf("|");
            if (i < 0) {
                return;
            }
            const format = msg.substring("/challenge".length, i).trim();
            this.respondToChallenge(s, format);
        }
    }
    public "|usercount|"(args: Args["|usercount|"]) {
        void args;
    }
    public "|nametaken|"(args: Args["|nametaken|"]) {
        void args;
    }
    public "|challstr|"(args: Args["|challstr|"]) {
        if (!this.challstrRes) {
            throw new Error("Received a second challstr");
        }
        this.challstrRes(args[1]);
    }
    public "|updateuser|"(args: Args["|updateuser|"]) {
        this.username = args[1].trim() as Protocol.Username;
        this.updateUser?.(this.username);
    }
    public "|formats|"(args: Args["|formats|"]) {
        void args;
    }
    public "|updatesearch|"(args: Args["|updatesearch|"]) {
        void args;
    }
    public "|updatechallenges|"(args: Args["|updatechallenges|"]) {
        if (!this.respondToChallenge) {
            return;
        }

        const json = Protocol.parseChallenges(args[1]);
        for (const [user, format] of Object.entries(json.challengesFrom)) {
            this.respondToChallenge(user, format);
        }
    }
    public "|queryresponse|"(args: Args["|queryresponse|"]) {
        void args;
    }
}

/* eslint-enable @typescript-eslint/naming-convention */
