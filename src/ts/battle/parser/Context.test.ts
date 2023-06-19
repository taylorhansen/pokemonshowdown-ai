/** @file Test helper for parsers. */
import {expect} from "chai";
import {Logger} from "../../utils/logging/Logger";
import {Verbose} from "../../utils/logging/Verbose";
import {BattleAgent, Action} from "../agent";
import {BattleState} from "../state";
import {ActionExecutor, ExecutorResult} from "./BattleParser";
import {StateHelpers} from "./StateHelpers.test";
import {BattleIterator} from "./iterators";
import {StartBattleParserArgs} from "./parsing";

/**
 * Initial context data required to start up the battle parser.
 *
 * Modifying fields here will reflect on the contents of {@link startArgs}.
 */
export interface InitialContext extends StartBattleParserArgs {
    /** Initial args for starting the BattleParser. */
    readonly startArgs: StartBattleParserArgs;
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
     * Executor deconstructed from {@link startArgs}. Can be overridden.
     * @override
     */
    executor: ActionExecutor;
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
    /** Return value of the BattleParser. Resolves once the game ends. */
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
    // TODO: Should logs be tested?
    const defaultLogger = new Logger(Logger.null, Verbose.None);
    const defaultExecutor: ActionExecutor = async () =>
        await Promise.reject(
            new Error("ActionExecutor expected to not be called"),
        );
    const getState = () => state;
    const ictx: InitialContext = {
        startArgs: {
            // Use an additional level of indirection so that agent/sender can
            // be overridden by test code.
            agent: async (s, choices) => await ictx.agent(s, choices),
            logger: new Logger(msg => ictx.logger.logFunc(msg), Verbose.Info),
            executor: async choices => await ictx.executor(choices),
            getState,
        },
        agent: defaultAgent,
        logger: defaultLogger,
        executor: defaultExecutor,
        getState,
        sh: new StateHelpers(getState),
    };

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Reset InitialContext", function () {
        ictx.agent = defaultAgent;
        ictx.logger = defaultLogger;
        ictx.executor = defaultExecutor;
    });

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Initialize BattleState", function () {
        state = new BattleState("username");
        state.started = true;
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
    readonly choices: () => Promise<Action[]>;
    /** Resolves the next `agent` promise. */
    readonly resolve: () => void;
}

/**
 * Adds BattleAgent override functionality to the InitialContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideAgent(ictx: InitialContext) {
    let choicesRes: ((choices: Action[]) => void) | null;

    let choices: Promise<Action[]>;
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

/** Result from {@link setupOverrideExecutor}. */
export interface OverrideExecutor {
    /**
     * Resolves on the next `executor` call.
     *
     * After awaiting, call {@link resolve} with an {@link ExecutorResult} value
     * to mimic {@link ActionExecutor} behavior.
     */
    readonly sent: () => Promise<Action>;
    /** Resolves the next `executor` promise. */
    readonly resolve: (result: ExecutorResult) => void;
}

/**
 * Adds ChoiceSender override functionality to the InitialContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideExecutor(ictx: InitialContext) {
    let executedRes: ((action: Action) => void) | null;

    let executed: Promise<Action>;
    let resolve: ((result: ExecutorResult) => void) | null;

    function initExecutedPromise() {
        executedRes = null;
        executed = new Promise(res => (executedRes = res));
    }

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Override sender", function () {
        initExecutedPromise();
        resolve = null;
        ictx.executor = async function overrideExecutor(choice) {
            try {
                return await new Promise<ExecutorResult>(res => {
                    resolve = res;
                    expect(executedRes).to.not.be.null;
                    executedRes!(choice);
                    initExecutedPromise(); // Reinit.
                });
            } finally {
                resolve = null;
            }
        };
    });

    return {
        executed: async () => await executed,
        resolve: (result: ExecutorResult) => {
            expect(resolve, "executed() wasn't awaited").to.not.be.null;
            resolve!(result);
        },
    };
}
