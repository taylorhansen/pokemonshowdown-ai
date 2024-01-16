import {Protocol} from "@pkmn/protocol";
import {Event} from "../protocol/Event";
import {Sender} from "../psbot/PsBot";
import {Logger} from "../utils/logging/Logger";
import {BattleAgent} from "./agent";
import {
    BattleParser,
    ExecutorResult,
    BattleParserContext,
} from "./parser/BattleParser";
import {BattleState} from "./state";

/**
 * Args for the {@link BattleDriver} constructor.
 *
 * @template TAgent Battle agent type.
 * @template TResult Parser result type.
 */
export interface BattleDriverArgs<TAgent extends BattleAgent = BattleAgent> {
    /** Client's username. */
    readonly username: string;
    /**
     * Function for building up a state representation to inform the
     * {@link agent}'s decision process. Should call the agent on `|request|`
     * events and forward selected actions to the {@link sender}.
     */
    readonly parser: BattleParser<TAgent>;
    /** Function for deciding what to do when asked for a decision. */
    readonly agent: TAgent;
    /** Used for sending messages to the battle stream. */
    readonly sender: Sender;
    /** Logger object. */
    readonly logger: Logger;
}

/**
 * Manages one player's side of a battle. Can be used with a PS server or battle
 * text stream as long as the protocol events are parsed beforehand.
 *
 * @template TAgent Battle agent type.
 * @template TResult Parser result type.
 */
export class BattleDriver<TAgent extends BattleAgent = BattleAgent> {
    /** Parses events to update the battle state. */
    private readonly parser: BattleParser<TAgent>;
    /** Parser state. */
    private readonly ctx: BattleParserContext<TAgent>;
    /** Logger object. */
    private readonly logger: Logger;

    /** Last unactioned `|request|` event for reordering. */
    private pendingRequest: Event<"|request|"> | null = null;

    /**
     * Callback to resolve the {@link BattleParser}'s last
     * {@link ActionExecutor} call. The next event received after that last call
     * is treated as a response to it.
     */
    private executorRes: ((result: ExecutorResult) => void) | null = null;
    /**
     * If the last unhandled `|error|` message indicated an unavailable
     * choice, this field describes the type of rejected {@link Choice}, and the
     * next message should be a `|request|` to reveal new info.
     */
    private unavailableChoice: "move" | "switch" | null = null;

    /**
     * Promise for the {@link BattleParser} to finish making a decision after
     * parsing a `|request|` event.
     */
    private decisionPromise: Promise<void> | null = null;

    /** Will be true (battling) or false (game over) once initialized. */
    private battling: boolean | null = null;
    /**
     * Whether {@link handle} has parsed any relevant game events since the last
     * {@link halt} call. When this and {@link battling} are true, then we
     * should expect a `|request|` event before the next {@link halt} call.
     */
    private progress = false;

    /** Creates a BattleDriver. */
    public constructor({
        username,
        parser,
        agent,
        sender,
        logger,
    }: BattleDriverArgs<TAgent>) {
        this.parser = parser;
        this.logger = logger;
        this.ctx = {
            agent,
            logger,
            executor: async (action, debug) =>
                await new Promise<ExecutorResult>(res => {
                    this.executorRes = res;
                    this.logger.info(`Sending choice: ${action}`);
                    if (
                        !sender(
                            `|/choose ${action}`,
                            ...(debug !== undefined
                                ? [`|DEBUG: ${debug}`]
                                : []),
                        )
                    ) {
                        this.logger.debug("Can't send action, force accept");
                        res(false);
                    }
                }).finally(() => (this.executorRes = null)),
            state: new BattleState(username),
        };
    }

    /**
     * Handles a battle event. Returns results from zero or more parser calls.
     */
    public async handle(event: Event): Promise<void> {
        // Filter out irrelevant/non-battle events.
        // TODO: Should be gen-specific.
        if (!BattleDriver.filter(event)) {
            return;
        }

        if (event.args[0] === "start") {
            // Game start.
            this.battling = true;
        } else if (["win", "tie"].includes(event.args[0])) {
            // Game over.
            this.battling = false;
        }

        // The next event we receive is treated as a response to the last call
        // to the choice sender function.
        if (event.args[0] === "request") {
            // Empty |request| event should be ignored.
            if (!event.args[1]) {
                return;
            }
            this.handleRequest(event as Event<"|request|">);
            // If this is the initial |request| before a |start| event, we
            // should also pass this to the parser normally.
            if (this.battling !== null) {
                return;
            }
        }
        if (event.args[0] === "error") {
            this.handleError(event as Event<"|error|">);
            return;
        }

        // After verifying that this is a relevant game event that progresses
        // the battle, we can safely assume that our last sent decision from the
        // last |request| event was accepted.
        this.executorRes?.(false);
        if (this.decisionPromise) {
            await this.decisionPromise;
        }

        // Process the game event normally.
        this.progress = true;
        await this.parser(this.ctx, event);
    }

    /** Handles a halt signal after parsing a block of battle events. */
    public halt(): void {
        // After parsing a non-terminating block of game-progressing events, we
        // should've expected a |request| event to have come before that block.
        if (!this.battling || !this.progress) {
            return;
        }
        if (!this.pendingRequest) {
            throw new Error("No |request| event to process");
        }
        if (this.decisionPromise) {
            throw new Error("Already halted");
        }

        // Send the last saved |request| event to the BattleParser here.
        // Normally a |request| is sent before the events leading up to the
        // actual request for a decision. Our BattleParser expects it to come
        // after so we reorder it here.
        // Typically this will cause ctx.executor to be called so we also want
        // to resolve this parser call once the server sends a response instead
        // of blocking here.
        // FIXME: If the outer battle expects a decision (sent via ctx.executor) but the parser call doesn't send one during this call, this can cause a deadlock while waiting for new battle events.
        this.decisionPromise = this.parser(this.ctx, this.pendingRequest).then(
            () => {
                this.decisionPromise = null;
            },
        );
        // Prevent crashing due to possible uncaught rejection as we will await
        // this later.
        this.decisionPromise.catch(() => {});
        // Reset for the next |request| event and the next block of
        // game-progressing events.
        this.pendingRequest = null;
        this.progress = false;
    }

    /**
     * Finishes the BattleDriver normally.
     *
     * @returns Parser result.
     */
    public finish(): void {
        if (this.decisionPromise) {
            throw new Error(
                "Battle finished but still has a pending decision. " +
                    "Likely ActionExecutor not called or the call hasn't " +
                    "resolved.",
            );
        }
    }

    /** Forces the internal {@link BattleParser} to finish. */
    public async forceFinish(): Promise<void> {
        this.executorRes?.(false);
        if (this.decisionPromise) {
            await this.decisionPromise;
        }
        this.finish();
    }

    private handleRequest(event: Event<"|request|">): void {
        if (this.pendingRequest) {
            const [, oldReq] = this.pendingRequest.args;
            const [, newReq] = event.args;
            if (newReq !== oldReq) {
                // Usually we'd expect an |error| event between two consecutive
                // |request| events to indicate a retry, but in some rare cases
                // we might receive a duplicate.
                throw new Error(
                    "Unhandled |request| event:\n" +
                        `pending: ${JSON.stringify(
                            Protocol.parseRequest(oldReq),
                        )}\n` +
                        `new: ${JSON.stringify(Protocol.parseRequest(newReq))}`,
                );
            }
            this.logger.info("Ignoring duplicate |request| event");
            return;
        }

        if (!this.unavailableChoice) {
            // Just received a new |request| event, which we won't send to the
            // BattleParser until we've first sent all of the game-progressing
            // events that follow it (i.e. until halt() gets called).
            this.pendingRequest = event;
            // Since this event indicates the next step in the battle, we should
            // let the parser know that its previous decision was accepted by
            // the server.
            this.executorRes?.(false);
            return;
        }

        // Since we already handled a |request| event from the last halt() call,
        // then this current event is supposed to give new information after a
        // decision was rejected by the game.
        // TODO: Actually process newly-revealed info.
        // After updating the battle state, we can finally resolve the
        // ActionExecutor promise that our BattleParser is waiting on.
        switch (this.unavailableChoice) {
            case "switch":
                this.executorRes?.("trapped");
                break;
            case "move":
                this.executorRes?.("disabled");
                break;
            // istanbul ignore next: Unreachable.
            default:
                this.executorRes?.(true);
        }
        this.unavailableChoice = null;
    }

    private handleError(event: Event<"|error|">): void {
        const [, reason] = event.args;
        if (reason.startsWith("[Unavailable choice] Can't ")) {
            // Rejected last action based on unknown info.
            // Here we're guaranteed to get another |request| event afterwards,
            // so consume that event to possibly update the battle state while
            // still leaving the original |request| event pending.
            const s = reason.substring("[Unavailable choice] Can't ".length);
            if (s.startsWith("move")) {
                this.unavailableChoice = "move";
            } else if (s.startsWith("switch")) {
                this.unavailableChoice = "switch";
            }
            // Note: Now that this info has been revealed, we should get an
            // updated |request| message afterwards.
        } else if (reason.startsWith("[Invalid choice]")) {
            // Rejected last action based on unrevealed or already-known info.
            this.executorRes?.(true);
        }
    }

    /** Checks whether the event is relevant to the battle. */
    private static filter<T extends Protocol.ArgName>(
        event: Event<T>,
    ): boolean {
        const key = Protocol.key(event.args);
        if (key === "|error|") {
            return true;
        }
        if (!key || !Object.hasOwnProperty.call(allowedBattleArgs, key)) {
            return false;
        }
        const pred = allowedBattleArgs[key as Protocol.BattleArgName];
        if (typeof pred === "function") {
            return (pred as (event: Event<T>) => boolean)(event);
        }
        return pred;
    }
}

const allowedBattleArgs: {
    readonly [T in Protocol.BattleArgName]:
        | boolean
        | ((event: Event<T>) => boolean);
} = {
    /* eslint-disable @typescript-eslint/naming-convention */
    // Protocol.BattleInitArgName
    "|player|": true,
    "|teamsize|": true,
    "|gametype|": true,
    "|gen|": true,
    "|tier|": true,
    "|rated|": true,
    "|seed|": true,
    "|rule|": true,
    "|clearpoke|": true,
    "|poke|": true,
    "|teampreview|": true,
    "|updatepoke|": true,
    "|start|": true,
    // Protocol.BattleProgressArgName
    "|done|": false,
    "|request|": true,
    "|inactive|": false,
    "|inactiveoff|": false,
    "|upkeep|": false,
    "|turn|": true,
    "|win|": true,
    "|tie|": true,
    "|t:|": false,
    // Protocol.BattleMajorArgName
    "|move|": true,
    "|switch|": true,
    "|drag|": true,
    "|detailschange|": true,
    "|replace|": true,
    "|swap|": true,
    "|cant|": true,
    "|faint|": true,
    "|message|": false,
    // Protocol.BattleMinorArgName
    "|-formechange|": true,
    "|-fail|": true,
    "|-block|": true,
    "|-notarget|": true,
    "|-miss|": true,
    "|-damage|": true,
    "|-heal|": true,
    "|-sethp|": true,
    "|-status|": true,
    "|-curestatus|": true,
    "|-cureteam|": true,
    "|-boost|": true,
    "|-unboost|": true,
    "|-setboost|": true,
    "|-swapboost|": true,
    "|-invertboost|": true,
    "|-clearboost|": true,
    "|-clearallboost|": true,
    "|-clearpositiveboost|": true,
    "|-clearnegativeboost|": true,
    "|-copyboost|": true,
    "|-weather|": true,
    "|-fieldstart|": true,
    "|-fieldend|": true,
    "|-sidestart|": true,
    "|-sideend|": true,
    "|-swapsideconditions|": true,
    "|-start|": true,
    "|-end|": true,
    "|-crit|": true,
    "|-supereffective|": true,
    "|-resisted|": true,
    "|-immune|": true,
    "|-item|": true,
    "|-enditem|": true,
    "|-ability|": true,
    "|-endability|": true,
    "|-transform|": true,
    "|-mega|": true,
    "|-primal|": true,
    "|-burst|": true,
    "|-zpower|": true,
    "|-zbroken|": true,
    // Sometimes comes out as its own message which can confuse the
    // BattleDriver.
    "|-activate|": event => event.args[2] !== "move: Struggle",
    "|-fieldactivate|": true,
    "|-hint|": false,
    "|-center|": true,
    "|-message|": false,
    "|-combine|": true,
    "|-waiting|": true,
    "|-prepare|": true,
    "|-mustrecharge|": true,
    "|-hitcount|": true,
    "|-singlemove|": true,
    "|-singleturn|": true,
    "|-anim|": false,
    "|-ohko|": true,
    "|-candynamax|": true,
    "|-terastallize|": true,
    /* eslint-enable @typescript-eslint/naming-convention */
};
