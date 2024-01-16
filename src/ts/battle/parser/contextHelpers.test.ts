import {expect} from "chai";
import {Logger} from "../../utils/logging/Logger";
import {Verbose} from "../../utils/logging/Verbose";
import {Mutable} from "../../utils/types";
import {Action} from "../agent";
import {BattleState} from "../state";
import {BattleParserContext, ExecutorResult} from "./BattleParser";

/** Creates a BattleParserContext suitable for tests. */
export function createTestContext(): Mutable<BattleParserContext> {
    const ctx: BattleParserContext = {
        agent: async () =>
            await Promise.reject(
                new Error("BattleAgent expected to not be called"),
            ),
        logger: new Logger(Logger.null, Verbose.None),
        executor: async () =>
            await Promise.reject(
                new Error("ActionExecutor expected to not be called"),
            ),
        state: new BattleState("username"),
    };
    ctx.state.started = true;
    ctx.state.ourSide = "p1";
    return ctx;
}

/** Result from {@link setupOverrideAgent}. */
export interface OverrideAgent {
    /**
     * Resolves on the next `agent` call.
     *
     * After awaiting, modify the returned array then call {@link resolve} to
     * mimic BattleAgent behavior.
     */
    readonly receiveChoices: () => Promise<Action[]>;
    /** Resolves the next `agent` promise. */
    readonly resolve: () => void;
}

/**
 * Adds BattleAgent override functionality to the BattleParserContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideAgent(
    ctx: () => Mutable<BattleParserContext>,
): OverrideAgent {
    let sendChoices: ((choices: Action[]) => void) | null;
    let receiveChoices: Promise<Action[]>;
    let resolve: (() => void) | null;

    function initReceiveChoices() {
        sendChoices = null;
        receiveChoices = new Promise<Action[]>(
            res => (sendChoices = res),
        ).finally(initReceiveChoices); // Reinit for next receive.
    }

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Override agent", function () {
        initReceiveChoices();
        resolve = null;
        ctx().agent = async function overrideAgent(state, choices) {
            expect(ctx().state).to.equal(state, "Mismatched state");
            await new Promise<void>(res => {
                resolve = res;
                expect(sendChoices).to.not.be.null;
                sendChoices!(choices);
            }).finally(() => (resolve = null));
        };
    });

    return {
        receiveChoices: async () => await receiveChoices,
        resolve: () => {
            expect(resolve, "receiveChoices() wasn't called and awaited").to.not
                .be.null;
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
     * to mimic ActionExecutor behavior.
     */
    readonly receiveAction: () => Promise<Action>;
    /** Resolves the next `executor` promise. */
    readonly resolve: (result: ExecutorResult) => void;
}

/**
 * Adds ActionExecutor override functionality to the BattleParserContext.
 *
 * Must be called from within a mocha `describe()` block.
 */
export function setupOverrideExecutor(
    ctx: () => Mutable<BattleParserContext>,
): OverrideExecutor {
    let sendAction: ((action: Action) => void) | null;
    let receiveAction: Promise<Action>;
    let resolve: ((result: ExecutorResult) => void) | null;

    function initReceiveAction() {
        sendAction = null;
        receiveAction = new Promise<Action>(res => (sendAction = res)).finally(
            initReceiveAction,
        ); // Reinit for next receive.
    }

    // eslint-disable-next-line mocha/no-top-level-hooks
    beforeEach("Override sender", function () {
        initReceiveAction();
        resolve = null;
        ctx().executor = async function overrideExecutor(choice) {
            try {
                return await new Promise<ExecutorResult>(res => {
                    resolve = res;
                    expect(sendAction).to.not.be.null;
                    sendAction!(choice);
                });
            } finally {
                resolve = null;
            }
        };
    });

    return {
        receiveAction: async () => await receiveAction,
        resolve: (result: ExecutorResult) => {
            expect(resolve, "receiveAction() wasn't called and awaited").to.not
                .be.null;
            resolve!(result);
        },
    };
}
