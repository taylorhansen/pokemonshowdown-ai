import {
    EvalTestConfig,
    ExperienceConfig,
    LearnConfig,
} from "../../config/types";
import {Logger} from "../../util/logging/Logger";
import {Seeder} from "../../util/random";
import {ModelWorker} from "../model/worker";
import {Opponent, OpponentResult} from "../play";
import {GamePool} from "../play/pool";
import {AgentExploreConfig} from "../play/pool/worker/GameProtocol";
import {evaluate} from "./evaluate";
import {rollout} from "./rollout";
import {update} from "./update";

/** Args for {@link episode}. */
export interface EpisodeArgs {
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
    /** Exploration policy for the rollout phase. */
    readonly explore: AgentExploreConfig;
    /** Configuration for generating experience from rollout games. */
    readonly experienceConfig: ExperienceConfig;
    /** Opponent data for training the model. */
    readonly trainOpponents: readonly Opponent[];
    /** Opponent data for evaluating the model. */
    readonly evalOpponents: readonly Opponent[];
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns: number;
    /** Configuration for the learning process. */
    readonly learnConfig: LearnConfig;
    /** Configuration for testing the evaluation step results. */
    readonly evalConfig?: EvalTestConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Path to the folder to store episode logs in. Omit to not store logs. */
    readonly logPath?: string;
    /** Random seed generators. */
    readonly seeders?: EpisodeSeeders;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
}

/** Random seed generators used by the training algorithm. */
export interface EpisodeSeeders {
    /** Random seed generator for the battle PRNGs. */
    readonly battle?: Seeder;
    /** Random seed generator for the random team PRNGs. */
    readonly team?: Seeder;
    /** Random seed generator for the random exploration policy. */
    readonly explore?: Seeder;
    /**
     * Random seed generator for learning algorithm's training example shuffler.
     */
    readonly learn?: Seeder;
}

/** Result from running a training {@link episode}. */
export interface EpisodeResult {
    /**
     * Final model loss after training, or `undefined` if an error was
     * encountered.
     */
    loss?: number;
    /** Whether the model likely improved. */
    didImprove: boolean;
    /** Results from evaluation games against each opponent. */
    evalResults: OpponentResult[];
}

/**
 * Runs a training episode, generating experience for a model and using that to
 * update the model, then afterwards evaluating it against some baselines.
 *
 * @returns The training loss and whether the model improved, as well as
 * individual results from evaluation opponents.
 */
export async function episode({
    name,
    step,
    models,
    games,
    model,
    explore,
    experienceConfig,
    trainOpponents,
    evalOpponents,
    maxTurns,
    learnConfig,
    evalConfig,
    logger,
    logPath,
    seeders,
    progress,
}: EpisodeArgs): Promise<EpisodeResult> {
    const {numExamples, expFiles} = await rollout({
        name,
        step,
        models,
        games,
        model,
        explore,
        experienceConfig,
        opponents: trainOpponents,
        maxTurns,
        logger: logger.addPrefix("Rollout: "),
        ...(logPath && {logPath}),
        ...(seeders && {seeders}),
        ...(progress && {progress}),
    });

    const loss = await update({
        name,
        step,
        models,
        model,
        numExamples,
        examplePaths: expFiles.map(f => f.path),
        learnConfig,
        logger: logger.addPrefix("Update: "),
        ...(logPath && {logPath}),
        ...(seeders && {seeders}),
        ...(progress && {progress}),
    });

    await Promise.all(expFiles.map(async f => await f.cleanup()));

    const {didImprove, evalResults} = await evaluate({
        name,
        step,
        models,
        games,
        model,
        opponents: evalOpponents,
        maxTurns,
        ...(evalConfig && {testConfig: evalConfig}),
        logger: logger.addPrefix("Eval: "),
        ...(logPath && {logPath}),
        ...(seeders && {seeders}),
        ...(progress && {progress}),
    });

    return {...(loss !== undefined && {loss}), didImprove, evalResults};
}
