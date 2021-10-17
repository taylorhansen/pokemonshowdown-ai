import { expect } from "chai";
import { Logger } from "../../../../../../Logger";
import { BattleAgent, Choice } from "../../../agent";
import { BattleIterator, ChoiceSender, SenderResult, StartBattleParserArgs }
    from "../../../parser";
import { BattleState } from "../state";
import { StateHelpers } from "./helpers.test";

/** Initial context from the main `testEvents()` function. */
export interface InitialContext extends StartBattleParserArgs<"gen4">
{
    /** Initial args for starting the BattleParser. */
    readonly startArgs: StartBattleParserArgs<"gen4">;
    /**
     * Agent deconstructed from `#startArgs`. Can be overridden.
     * @override
     */
    agent: BattleAgent;
    /**
     * Logger deconstructed from `#startArgs`. Can be overridden.
     * @override
     */
    logger: Logger;
    /**
     * Sender deconstructed from `#startArgs`. Can be overridden
     * @override
     */
    sender: ChoiceSender;
    /** BattleState helper functions. */
    readonly sh: StateHelpers;
}

/**
 * Controls a currently-running {@link BattleParser}.
 * @template TResult Parser result type
 */
export interface ParserContext<TResult = unknown>
{
    /** Iterator for sending events to the BattleParser. */
    readonly battleIt: BattleIterator;
    /** Return value of the BattleParser/SubParser. */
    readonly finish: Promise<TResult>;
}

/**
 * Creates the initial config for starting BattleParsers.
 *
 * Note that the {@link BattleState} is constructed with
 * {@link BattleState.ourSide} = `p1`.
 */
export function createInitialContext(): InitialContext
{
    let state: BattleState;

    async function defaultAgent()
    { throw new Error("BattleAgent expected to not be called"); }
    // suppress logs
    // TODO: should logs be tested?
    const defaultLogger = Logger.null;
    async function defaultSender()
    { throw new Error("ChoiceSender expected to not be called"); }
    function getState() { return state; }
    const ictx: InitialContext =
    {
        startArgs:
        {
            // use a level of indirection so agent/sender can be modified
            agent: (s, choices) => ictx.agent(s, choices),
            logger: new Logger(msg => ictx.logger.debug(msg),
                msg => ictx.logger.error(msg)),
            sender: choices => ictx.sender(choices), getState
        },
        agent: defaultAgent, logger: defaultLogger, sender: defaultSender,
        getState, sh: new StateHelpers(getState)
    };

    beforeEach("Reset InitialContext", function()
    {
        ictx.agent = defaultAgent;
        ictx.logger = defaultLogger;
        ictx.sender = defaultSender;
    });

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState("username");
        state.ourSide = "p1";
    });

    return ictx;
}

/** Result from {@link setupOverrideAgent}. */
export interface OverrideAgent
{
    /**
     * Resolves on the next `agent` call. After awaiting, modify this array then
     * call `#resolve()` to mimic BattleAgent behavior.
     */
    choices(): Promise<Choice[]>;
    /** Resolves the next `agent` promise. */
    resolve(): void;
}

/** Adds BattleAgent override functionality to the InitialContext. */
export function setupOverrideAgent(ictx: InitialContext)
{
    let choicesRes: ((choices: Choice[]) => void) | null;

    let choices: Promise<Choice[]>;
    let resolve: (() => void) | null;

    function initAgentPromise()
    {
        choicesRes = null;
        choices = new Promise(res => choicesRes = res);
    }

    beforeEach("Override agent", function()
    {
        initAgentPromise();
        resolve = null;
        ictx.agent = async function overrideAgent(_state, _choices)
        {
            expect(ictx.getState()).to.equal(_state, "Mismatched _state");
            await new Promise<void>(res =>
            {
                resolve = res;
                expect(choicesRes).to.not.be.null;
                choicesRes!(_choices);
                initAgentPromise(); // reinit
            })
                .finally(() => resolve = null);
        }
    });

    return {
        async choices() { return await choices; },
        resolve()
        {
            expect(resolve, "choices() wasn't awaited").to.not.be.null;
            resolve!();
        }
    };
}

/** Result from {@link setupOverrideSender}. */
export interface OverrideSender
{
    /**
     * Resolves on the next `sender` call. After awaiting, call `#resolve()`
     * with a ChoiceResult value to mimic ChoiceSender behavior.
     */
    sent(): Promise<Choice>;
    /** Resolves the next `sender` promise. */
    resolve(result: SenderResult): void;
}

/** Adds ChoiceSender override functionality to the InitialContext. */
export function setupOverrideSender(ictx: InitialContext)
{
    let sentRes: ((choice: Choice) => void) | null;

    let sent: Promise<Choice>;
    let resolve: ((result: SenderResult) => void) | null;

    function initSentPromise()
    {
        sentRes = null;
        sent = new Promise(res => sentRes = res);
    }

    beforeEach("Override sender", function()
    {
        initSentPromise();
        resolve = null;
        ictx.sender = async function sender(choice)
        {
            const result = await new Promise<SenderResult>(res =>
            {
                resolve = res;
                expect(sentRes).to.not.be.null;
                sentRes!(choice);
                initSentPromise(); // reinit
            })
                .finally(() => resolve = null);
            return result;
        };
    });

    return {
        async sent() { return await sent; },
        resolve(result: SenderResult)
        {
            expect(resolve, "sent() wasn't awaited").to.not.be.null;
            resolve!(result);
        }
    };
}
