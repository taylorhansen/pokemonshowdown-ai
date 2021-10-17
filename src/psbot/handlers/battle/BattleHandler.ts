import { Protocol } from "@pkmn/protocol";
import { Logger } from "../../../Logger";
import { Event } from "../../parser";
import { Sender } from "../../PSBot";
import { RoomHandler } from "../RoomHandler";
import { BattleAgent } from "./agent";
import * as formats from "./formats";
import { BattleIterator, BattleParser, ChoiceSender, SenderResult,
    startBattleParser, StartBattleParserArgs } from "./parser";

/**
 * Args for BattleHandler constructor.
 * @template T Battle format for this room.
 * @template TAgent Battle agent type.
 */
export interface BattleHandlerArgs
<
    T extends formats.FormatType = formats.FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>
>
{
    /** Battle format for this room. */
    readonly format: T;
    /** Client's username. */
    readonly username: string;
    /**
     * Function for building up a battle state for the BattleAgent. Defaults to
     * format default.
     */
    readonly parser?: BattleParser<T, TAgent, [], void>;
    /** BattleState constructor function. Defaults to format default. */
    readonly stateCtor?: formats.StateConstructor<T>;
    /** Function for deciding what to do. */
    readonly agent: TAgent;
    /** Used for sending messages to the assigned server room. */
    readonly sender: Sender;
    /** Logger object. Default stderr. */
    readonly logger?: Logger;
}

/**
 * Base handler for battle rooms.
 * @template T Battle format for this room.
 * @template TAgent Battle agent type.
 */
export class BattleHandler
<
    T extends formats.FormatType = formats.FormatType,
    TAgent extends BattleAgent<T> = BattleAgent<T>
>
    implements RoomHandler
{
    /** Battle format for this room. */
    public readonly format: T;
    /** Used for sending messages to the assigned server room. */
    private readonly sender: Sender;
    /** Logger object. */
    private readonly logger: Logger;

    /** Last received `|request|` event for ChoiceSender handling. */
    private lastRequestEvent: Event<"|request|"> | null = null;
    /** Last unactioned `|request|` event for reordering. */
    private pendingRequest: Event<"|request|"> | null = null;

    /**
     * Callback to resolve the BattleParser's last ChoiceSender call. The next
     * event received after that last call is treated as a response to it.
     */
    private choiceSenderRes: ((result: SenderResult) => void) | null = null;
    /**
     * If the last unhandled `|error|` message indicated an unavailable
     * choice, this field describes the type of rejected Choice, and the next
     * message should be a `|request|` to reveal new info.
     */
    private unavailableChoice: "move" | "switch" | null = null;

    /** Iterator for sending PS Events to the BattleParser. */
    private readonly iter: BattleIterator;
    /**
     * Promise for the BattleParser to finish making a decision after parsing a
     * `|request|` event.
     */
    private decisionPromise: ReturnType<BattleIterator["next"]> | null = null;
    /** Promise for the entire BattleParser to finish. */
    private readonly finishPromise: Promise<unknown>;

    /** Whether the game has been fully initialized. */
    private battling = false;
    /**
     * Whether `#handle()` has parsed any relevant game events since the last
     * `#halt()`. When this and `#battling` are true, then we should expect a
     * `|request|` event on the next `#halt()`.
     */
    private progress = false;

    /** Creates a BattleHandler. */
    constructor(
        {
            format, username,
            parser = formats.parser[format] as any as
                BattleParser<T, TAgent, [], void>,
            stateCtor = formats.state[format], agent, sender,
            logger = Logger.stderr
        }:
        BattleHandlerArgs<T, TAgent>)
    {
        this.format = format;
        this.sender = sender;
        this.logger = logger;

        const choiceSender: ChoiceSender =
            choice =>
                new Promise<SenderResult>(res =>
                {
                    this.choiceSenderRes = res;
                    if (!this.sender(`|/choose ${choice}`))
                    {
                        this.logger.debug("Can't send Choice, force accept");
                        res();
                    }
                })
                .finally(() => this.choiceSenderRes = null);

        const cfg: StartBattleParserArgs<T, TAgent> =
        {
            agent, logger: this.logger.addPrefix("BattleParser: "),
            sender: choiceSender, getState: () => new stateCtor(username)
        };

        const {iter, finish} = startBattleParser(cfg, parser);

        this.iter = iter;
        this.finishPromise = finish;
    }

    /** @override */
    public async handle(event: Event): Promise<void>
    {
        // filter out irrelevant/non-battle events
        // TODO: should be gen-specific
        if (!BattleHandler.filter(event)) return;

        // game start
        if (event.args[0] === "start") this.battling = true;
        // game over
        else if (["win", "tie"].includes(event.args[0])) this.battling = false;

        // the next event we receive is treated as a response to the last call
        //  to the choice sender function
        if (event.args[0] === "request")
        {
            // empty |request| event should be ignored
            if (!event.args[1]) return;
            this.handleRequest(event as Event<"|request|">);
            // use the first valid |request| event to also initialize during the
            //  init phase of parsing
            if (this.battling) return;
        }
        if (event.args[0] === "error")
        {
            this.handleError(event as Event<"|error|">);
            return;
        }

        // after verifying that this is a relevant game event that progresses
        //  the battle, we can safely assume that this means that our last sent
        //  decision from the last |request| event was accepted
        this.choiceSenderRes?.();
        if (this.decisionPromise && (await this.decisionPromise).done)
        {
            await this.finish();
            return;
        }

        // process the game event normally
        this.progress = true;
        if ((await this.iter.next(event)).done) await this.finish();
    }

    /** @override */
    public halt(): void
    {
        // after parsing a non-terminating block of game-progressing events,
        //  we should've expected a |request| event to have come before that
        //  block
        if (!this.battling || !this.progress) return;
        if (!this.pendingRequest)
        {
            throw new Error("No |request| event to process");
        }
        if (this.decisionPromise) throw new Error("Already halted");

        // send the last saved |request| event to the BattleParser here
        // this reordering allows us to treat |request| as an actual request for
        //  a decision _after_ handling all of the relevant game events
        // however, we can't await here since the ChoiceSender can only resolve
        //  once it has seen game-progressing events to confirm its response
        this.decisionPromise = this.iter.next(this.pendingRequest)
            .finally(() => this.decisionPromise = null);
        // reset for the next |request| event and the next block of
        //  game-progressing events
        this.pendingRequest = null;
        this.progress = false;
    }

    /**
     * Waits for the internal BattleParser to return after handling a game-over.
     */
    public async finish(): Promise<void>
    {
        if (this.decisionPromise) await this.decisionPromise;
        await this.finishPromise;
    }

    /** Forces the internal BattleParser to finish. */
    public async forceFinish(): Promise<void>
    {
        await this.iter.return();
        await this.finish();
    }

    private handleRequest(event: Event<"|request|">): void
    {
        if (this.pendingRequest) throw new Error("Unhandled |request| event");
        this.pendingRequest = event;

        const lastRequestEvent = this.lastRequestEvent;
        this.lastRequestEvent = event;

        if (!this.unavailableChoice)
        {
            // last sent choice was accepted, so this is the next request
            //  containing the state after handling our choice
            // the request state json provided always reflects the results of
            //  the next block of game events coming after this event
            this.choiceSenderRes?.();
            return;
        }

        // consume unavailableChoice error from last |error| event
        const lastRequest = lastRequestEvent &&
            Protocol.parseRequest(lastRequestEvent.args[1]);
        const request = Protocol.parseRequest(event.args[1]);

        // new info may be revealed
        if (this.unavailableChoice === "switch" &&
            lastRequest?.requestType === "move" &&
            lastRequest.active[0] && !lastRequest.active[0].trapped &&
            request.requestType === "move" && request.active[0]?.trapped)
        {
            this.choiceSenderRes?.("trapped");
        }
        else if (this.unavailableChoice === "move" &&
            request.requestType === "move" && request.active[0])
        {
            this.choiceSenderRes?.("disabled");
        }
        else this.choiceSenderRes?.(true);

        this.unavailableChoice = null;
    }

    private handleError(event: Event<"|error|">): void
    {
        const [, reason] = event.args;
        if (reason.startsWith("[Unavailable choice] Can't "))
        {
            // rejected last choice based on unknown info
            // wait for another (guaranteed) request message before proceeding
            const s = reason.substr("[Unavailable choice] Can't ".length);
            // TODO: does this distinction matter?
            if (s.startsWith("move")) this.unavailableChoice = "move";
            else if (s.startsWith("switch")) this.unavailableChoice = "switch";
            // note: now that this info has been revealed, we should get an
            //  updated |request| message
        }
        else if (reason.startsWith("[Invalid choice]"))
        {
            // rejected last choice based on unrevealed or already-known info
            this.choiceSenderRes?.(true);
        }
    }

    /** Checks whether the event is relevant to the battle. */
    private static filter<T extends Protocol.ArgName>(event: Event<T>): boolean
    {
        const key = Protocol.key(event.args);
        if (key === "|error|") return true;
        if (!key || !allowedBattleArgs.hasOwnProperty(key)) return false;
        const pred = allowedBattleArgs[key as Protocol.BattleArgName];
        if (typeof pred === "function")
        {
            return (pred as (event: Event<T>) => boolean)(event);
        }
        return pred;
    }
}

const allowedBattleArgs:
{
    readonly [T in Protocol.BattleArgName]:
        boolean | ((event: Event<T>) => boolean)
} =
{
    // Protocol.BattleInitArgName
    "|player|": true, "|teamsize|": true, "|gametype|": true, "|gen|": true,
    "|tier|": true, "|rated|": true, "|seed|": true, "|rule|": true,
    "|clearpoke|": true, "|poke|": true, "|teampreview|": true,
    "|updatepoke|": true, "|start|": true,
    // Protocol.BattleProgressArgName
    "|done|": false, "|request|": true, "|inactive|": false,
    "|inactiveoff|": false, "|upkeep|": false, "|turn|": true, "|win|": true,
    "|tie|": true, "|t:|": false,
    // Protocol.BattleMajorArgName
    "|move|": true, "|switch|": true, "|drag|": true, "|detailschange|": true,
    "|replace|": true, "|swap|": true, "|cant|": true, "|faint|": true,
    "|message|": false, "|split|": false,
    // Protocol.BattleMinorArgName
    "|-formechange|": true, "|-fail|": true, "|-block|": true,
    "|-notarget|": true, "|-miss|": true, "|-damage|": true, "|-heal|": true,
    "|-sethp|": true, "|-status|": true, "|-curestatus|": true,
    "|-cureteam|": true, "|-boost|": true, "|-unboost|": true,
    "|-setboost|": true, "|-swapboost|": true, "|-invertboost|": true,
    "|-clearboost|": true, "|-clearallboost|": true,
    "|-clearpositiveboost|": true, "|-clearnegativeboost|": true,
    "|-copyboost|": true, "|-weather|": true, "|-fieldstart|": true,
    "|-fieldend|": true, "|-sidestart|": true, "|-sideend|": true,
    "|-swapsideconditions|": true, "|-start|": true, "|-end|": true,
    "|-crit|": true, "|-supereffective|": true, "|-resisted|": true,
    "|-immune|": true, "|-item|": true, "|-enditem|": true, "|-ability|": true,
    "|-endability|": true, "|-transform|": true, "|-mega|": true,
    "|-primal|": true, "|-burst|": true, "|-zpower|": true, "|-zbroken|": true,
    "|-activate|"(event)
    {
        // sometimes comes out as its own message which can confuse the
        //  BattleHandler
        return event.args[2] !== "move: Struggle";
    },
    "|-fieldactivate|": true,
    "|-hint|": false, "|-center|": true,
    "|-message|"(event)
    {
        // only accept messages that are actually parsed
        return allowedMinorMessages.includes(event.args[1]);
    },
    "|-combine|": true, "|-waiting|": true, "|-prepare|": true,
    "|-mustrecharge|": true, "|-hitcount|": true, "|-singlemove|": true,
    "|-singleturn|": true, "|-anim|": false, "|-ohko|": true,
    "|-candynamax|": true
}

const allowedMinorMessages: readonly string[] =
[
    "Custap Berry activated.",
    "Sleep Clause Mod activated."
];
