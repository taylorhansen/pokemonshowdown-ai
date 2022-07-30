import * as path from "path";
import {EvalTestConfig} from "../../config/types";
import {Logger} from "../../util/logging/Logger";
import {ModelWorker} from "../model/worker";
import {
    Opponent,
    OpponentResult,
    playGames,
    PlayGamesSeedRandomArgs,
} from "../play";
import {GamePool} from "../play/pool";

/** Args for {@link evaluate}. */
export interface EvaluateArgs {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. */
    readonly step: number;
    /** Used to request model ports for the game workers. */
    readonly models: ModelWorker;
    /** Used to play parallel games. */
    readonly games: GamePool;
    /** Name of the model to train. */
    readonly model: string;
    /** Opponent args. */
    readonly opponents: readonly Opponent[];
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns: number;
    /** Configuration for testing the evaluation step results. */
    readonly testConfig?: EvalTestConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Random seed generators. */
    readonly seed?: PlayGamesSeedRandomArgs;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
}

/** Result from {@link evaluate}. */
export interface EvaluateResult {
    /** Whether the model likely improved. */
    didImprove: boolean;
    /** Results from evaluation games against each opponent. */
    evalResults: OpponentResult[];
}

/**
 * Runs the evaluation phase of the training script, testing the updated model
 * against some baselines.
 *
 * @returns Whether to accept the updated model, as well as individual results
 * from playing against each baseline opponent.
 */
export async function evaluate({
    name,
    step,
    models,
    games,
    model,
    opponents,
    maxTurns,
    testConfig,
    logger,
    logPath,
    seed,
    progress,
}: EvaluateArgs): Promise<EvaluateResult> {
    logger.info("Evaluating new network against baselines");

    const {opponents: gameResults} = await playGames({
        name,
        step,
        stage: "eval",
        models,
        games,
        agentConfig: {exploit: {type: "model", model}},
        opponents,
        maxTurns,
        logger,
        ...(logPath && {logPath: path.join(logPath, "eval")}),
        ...(seed && {seed}),
        progress,
    });

    const testLog = logger.addPrefix("Test: ");

    if (!testConfig) {
        testLog.debug("Assuming the model is improving for now");
        return {didImprove: true, evalResults: gameResults};
    }

    testLog.debug(
        "Running a statistical test to see if the model is improving",
    );

    let {against} = testConfig;
    if (!Array.isArray(against)) {
        against = [against];
    }
    if (against.length <= 0) {
        testLog.error("No opponents to test against");
        testLog.debug("Assuming the model is improving for now");
        return {didImprove: true, evalResults: gameResults};
    }
    const vs = gameResults.filter(opp => against.includes(opp.name));
    if (vs.length <= 0) {
        testLog.error(
            `Could not find opponents [${against.join(", ")}] in eval results`,
        );
        testLog.info("Assuming the model is improving for now");
        return {didImprove: true, evalResults: gameResults};
    }

    testLog.debug(`Min score: ${testConfig.minScore}`);

    let conclusion = true;
    for (const opp of vs) {
        const vsLog = testLog.addPrefix(`Versus ${opp.name}: `);

        const total = opp.wins + opp.losses + opp.ties;
        const successes = testConfig.includeTies
            ? opp.wins + opp.ties
            : opp.wins;
        const score = successes / total;
        vsLog.debug(
            `Score: ${successes} / ${total} = ${score.toFixed(2)} ` +
                `(counting wins${
                    testConfig.includeTies ? " and ties" : " only"
                })`,
        );

        conclusion &&= score >= testConfig.minScore;
    }

    testLog.debug(
        `Conclusion: ${conclusion ? "Accept" : "Reject"} updated model`,
    );
    return {didImprove: conclusion, evalResults: gameResults};
}
