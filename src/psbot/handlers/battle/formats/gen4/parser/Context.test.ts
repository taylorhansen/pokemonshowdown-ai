import {expect} from "chai";
import {Logger} from "../../../../../../logging/Logger";
import {BattleAgent, Choice} from "../../../agent";
import {
    BattleIterator,
    ChoiceSender,
    SenderResult,
    StartBattleParserArgs,
} from "../../../parser";
import {BattleState} from "../state";
import {StateHelpers} from "./StateHelpers.test";

/** Initial context from the main `testEvents()` function. */
export interface InitialContext extends StartBattleParserArgs<"gen4"> {
    /** Initial args for starting the BattleParser. */
    readonly startArgs: StartBattleParserArgs<"gen4">;
    /**
     * Agent deconstructed from {@link startArgs}. Can be overridden.
     * @override
     */
    agent: BattleAgent;
    /**
     * Logger deconstructed from {@link startArgs}. Can be overridden.
     * @override
     */
    logger: Logger;
    /**
     * Sender deconstructed from {@link startArgs}. Can be overridden.
     * @override
     */
    sender: ChoiceSender;
    /** BattleState helper functions. */
    readonly sh: StateHelpers;
}

/**
 * Controls a currently-running {@link BattleParser}.
 *
 * @template TResult Parser result type
 */
export interface ParserContext<TResult = unknown> {
    /** Iterator for sending events to the BattleParser. */
    readonly battleIt: BattleIterator;
    /** Return value of the BattleParser/SubParser. */
    readonly finish: Promise<TResult>;
}

/**
 * Creates the initial config for starting BattleParsers.
 *
 * Must be called from within a mocha `describe()` block.
 *
 * Note that the {@link BattleState} is constructed with
 * {@link BattleState.ourSide} = `"p1"`.
 */
export function createInitialContext(): InitialContext {
    let state: BattleState;

    const defaultAgent = async () =>
        await Promise.reject(
            new Error("BattleAgent expected to not be called"),
        );
    // Suppress logs.
    // TODO: Should logs be tested?
    const defaultLogger = Logger.null;
    const defaultSender = async () =>
        await Promise.reject(
            new Error("ChoiceSender expected to not be called"),
        );
    const getState = () => state;
    const ictx: InitialContext = {
        startArgs: {
            // Use a level of indirection so that agent/sender can be overridden
            // later.
            agent: async (s, choices) => await ictx.agent(s, choices),
            logger: new Logger(
                msg => ictx.logger.debug(msg),
                msg => ictx.logger.error(msg),
            ),
            sender: async choices => await ictx.sender(choices),
            getState,
        },
        agent: defaultAgent,
        logger: defaultLogger,
        sender: defaultSender,
        getState,
        sh: new StateHelpers(getState),
    };

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Reset InitialContext", function () {
        ictx.agent = defaultAgent;
        ictx.logger = defaultLogger;
        ictx.sender = defaultSender;
    });

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Initialize BattleState", function () {
        state = new BattleState("username");
        state.ourSide = "p1";
    });

    return ictx;
}

/** Result from {@link setupOverrideAgent}. */
export interface OverrideAgent {
    /**
     * Resolves on the next `agent` call.
     *
     * After awaiting, modify this array then call {@link resolve} to mimic
     * {@link BattleAgent} behavior.
     */
    readonly choices: () => Promise<Choice[]>;
    /** Resolves the next `agent` promise. */
    readonly resolve: () => void;
}

/**
 * Adds BattleAgent override functionality to the InitialContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideAgent(ictx: InitialContext) {
    let choicesRes: ((choices: Choice[]) => void) | null;

    let choices: Promise<Choice[]>;
    let resolve: (() => void) | null;

    function initAgentPromise() {
        choicesRes = null;
        choices = new Promise(res => (choicesRes = res));
    }

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Override agent", function () {
        initAgentPromise();
        resolve = null;
        ictx.agent = async function overrideAgent(_state, _choices) {
            expect(ictx.getState()).to.equal(_state, "Mismatched _state");
            await new Promise<void>(res => {
                resolve = res;
                expect(choicesRes).to.not.be.null;
                choicesRes!(_choices);
                initAgentPromise(); // Reinit.
            }).finally(() => (resolve = null));
        };
    });

    return {
        choices: async () => await choices,
        resolve: () => {
            expect(resolve, "choices() wasn't awaited").to.not.be.null;
            resolve!();
        },
    };
}

/** Result from {@link setupOverrideSender}. */
export interface OverrideSender {
    /**
     * Resolves on the next `sender` call.
     *
     * After awaiting, call {@link resolve} with a ChoiceResult value to mimic
     * {@link ChoiceSender} behavior.
     */
    readonly sent: () => Promise<Choice>;
    /** Resolves the next `sender` promise. */
    readonly resolve: (result: SenderResult) => void;
}

/**
 * Adds ChoiceSender override functionality to the InitialContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideSender(ictx: InitialContext) {
    let sentRes: ((choice: Choice) => void) | null;

    let sent: Promise<Choice>;
    let resolve: ((result: SenderResult) => void) | null;

    function initSentPromise() {
        sentRes = null;
        sent = new Promise(res => (sentRes = res));
    }

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Override sender", function () {
        initSentPromise();
        resolve = null;
        ictx.sender = async function overrideSender(choice) {
            const result = await new Promise<SenderResult>(res => {
                resolve = res;
                expect(sentRes).to.not.be.null;
                sentRes!(choice);
                initSentPromise(); // Reinit.
            }).finally(() => (resolve = null));
            return result;
        };
    });

    return {
        sent: async () => await sent,
        resolve: (result: SenderResult) => {
            expect(resolve, "sent() wasn't awaited").to.not.be.null;
            resolve!(result);
        },
    };
}
