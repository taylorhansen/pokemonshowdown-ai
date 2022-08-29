import * as path from "path";
import {pathToFileURL} from "url";
import {Config} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {ensureDir} from "../util/paths/ensureDir";
import {seeder} from "../util/random";
import {episode, EpisodeSeeders} from "./episode/episode";
import {ModelWorker} from "./model/worker";
import {Opponent, OpponentResult} from "./play";
import {GamePool} from "./play/pool";
import {AgentExploreConfig} from "./play/pool/worker/GameProtocol";

/** Args for {@link train}. */
export interface TrainArgs {
    /** Name of this training run. */
    readonly name: string;
    /** Config for training. */
    readonly config: Config;
    /** Object used to manage TensorFlow model ops. */
    readonly models: ModelWorker;
    /** Object used to manage parallel games. */
    readonly games: GamePool;
    /** Logger object used to provide console output. */
    readonly logger: Logger;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
    /**
     * Relative path from the models folder (specified in {@link Config.paths}),
     * from which a model will be loaded to resume training instead of creating
     * a default model.
     */
    readonly resume?: string;
}

/** Result from {@link train}. */
export interface TrainResult {
    /**
     * Final model loss after training, or `undefined` if an error was
     * encountered.
     */
    loss?: number;
    /** Final evaluation game results vs a random opponent. */
    randomOpponentResult: OpponentResult;
}

/**
 * Executes the training procedure with the given config.
 *
 * @returns The final model loss and the final benchmark results against a
 * random opponent.
 */
export async function train({
    name,
    config,
    models,
    games,
    logger,
    progress,
    resume,
}: TrainArgs): Promise<TrainResult> {
    const latestModelPath = path.join(config.paths.models, "latest");
    const latestModelUrl = pathToFileURL(latestModelPath).href;

    // Create or load neural network.
    let model: string;
    if (resume) {
        const resumeFolder = path.join(config.paths.models, resume || "");
        const resumeLoadUrl = pathToFileURL(
            path.join(resumeFolder, "model.json"),
        ).href;
        logger.info("Loading model: " + resumeFolder);
        try {
            model = await models.load(
                "model",
                config.train.batchPredict,
                resumeLoadUrl,
            );
        } catch (e) {
            logger.error(`Error opening model: ${e}`);
            logger.info("Creating default model instead");
            model = await models.load(
                "model",
                config.train.batchPredict,
                undefined /*url*/,
                config.train.seeds?.model,
            );

            logger.debug("Saving new model as latest");
            await ensureDir(latestModelPath);
            await models.save(model, latestModelUrl);
        }
    } else {
        logger.info("Creating default model");
        model = await models.load(
            "model",
            config.train.batchPredict,
            undefined /*url*/,
            config.train.seeds?.model,
        );

        logger.debug("Saving new model as latest");
        await ensureDir(latestModelPath);
        await models.save(model, latestModelUrl);
    }

    logger.debug("Creating copy of original for later evaluation");
    const previousModel = await models.clone(model, "model_prev");
    logger.debug("Saving copy as original");
    const originalModelFolder = path.join(config.paths.models, "original");
    await models.save(previousModel, pathToFileURL(originalModelFolder).href);

    const evalOpponents: readonly Opponent[] = [
        {
            name: "random",
            agentConfig: {exploit: {type: "random"}},
            numGames: config.train.eval.numGames,
        },
        {
            name: "previous",
            agentConfig: {exploit: {type: "model", model: previousModel}},
            numGames: config.train.eval.numGames,
        },
    ];

    let explore: AgentExploreConfig = {
        factor: config.train.rollout.policy.exploration,
    };
    const {explorationDecay, minExploration} = config.train.rollout.policy;

    const seeders: EpisodeSeeders | undefined = config.train.seeds && {
        ...(config.train.seeds.battle && {
            battle: seeder(config.train.seeds.battle),
        }),
        ...(config.train.seeds.team && {
            team: seeder(config.train.seeds.team),
        }),
        ...(config.train.seeds.explore && {
            explore: seeder(config.train.seeds.explore),
        }),
        ...(config.train.seeds.learn && {
            learn: seeder(config.train.seeds.learn),
        }),
    };

    let latestResults: TrainResult | undefined;
    for (let step = 1; step <= config.train.numEpisodes; ++step) {
        const episodeLog = logger.addPrefix(
            `Episode(${String(step).padStart(
                Math.max(1, Math.ceil(Math.log10(config.train.numEpisodes))),
            )}/${config.train.numEpisodes}): `,
        );

        await models.log(name, step, {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "rollout/exploration": explore.factor,
        });

        let numRetries = 0;
        let loss: number | undefined;
        let evalResults: OpponentResult[] | undefined;
        while (true) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            await models.log(name, step, {num_retries: numRetries});

            const episodeResult = await episode({
                name,
                step,
                models,
                games,
                model,
                explore,
                experienceConfig: config.train.rollout.experience,
                // TODO: Include ancestor opponents to avoid strategy collapse.
                trainOpponents: [
                    {
                        name: "self",
                        agentConfig: {
                            exploit: {type: "model", model},
                            explore,
                            emitExperience: true,
                        },
                        numGames: config.train.rollout.numGames,
                    },
                ],
                evalOpponents,
                maxTurns: config.train.game.maxTurns,
                learnConfig: config.train.learn,
                ...(config.train.eval.test && {
                    evalConfig: config.train.eval.test,
                }),
                logger: episodeLog,
                logPath: path.join(config.paths.logs, `episode-${step}`),
                ...(seeders && {seeders}),
                progress,
            });
            ({loss, evalResults} = episodeResult);

            if (episodeResult.didImprove) {
                break;
            }

            // Note: When retrying, all logs for this step are overwritten.
            ++numRetries;
            episodeLog.info(`Model did not improve, retrying (${numRetries})`);
            await models.copy(previousModel /*from*/, model /*to*/);
        }

        if (config.train.savePreviousVersions) {
            const episodeFolderName = `episode-${step}`;
            episodeLog.debug(`Saving updated model as ${episodeFolderName}`);
            const episodeModelFolder = path.join(
                config.paths.models,
                episodeFolderName,
            );
            await models.save(model, pathToFileURL(episodeModelFolder).href);
        }

        episodeLog.debug("Saving updated model as latest");
        await models.save(model, latestModelUrl);

        explore = {
            factor: Math.max(explore.factor * explorationDecay, minExploration),
        };
        await models.copy(model /*from*/, previousModel /*to*/);

        const randomOpponentResult = evalResults?.find(
            result => result.name === "random",
        );
        if (!randomOpponentResult) {
            throw new Error("Missing random opponent result");
        }

        latestResults = {
            ...(loss !== undefined && {loss}),
            randomOpponentResult,
        };
    }

    await Promise.all([models.unload(model), models.unload(previousModel)]);

    if (!latestResults) {
        throw new Error("Missing training results");
    }
    return latestResults;
}
