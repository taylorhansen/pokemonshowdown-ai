import * as path from "path";
import {pathToFileURL} from "url";
import {Config} from "../config/types";
import {hash} from "../util/hash";
import {Logger} from "../util/logging/Logger";
import {ensureDir} from "../util/paths/ensureDir";
import {episode, EpisodeSeedRandomArgs} from "./episode";
import {ModelWorker} from "./model/worker";
import {Opponent} from "./play";
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
    /** Configure random number generators. */
    readonly seeds?: SeedConfig;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
    /**
     * Relative path from the models folder (specified in {@link Config.paths}),
     * from which a model will be loaded to resume training instead of creating
     * a default model.
     */
    readonly resume?: string;
}

/** Configuration for random number generators. */
export interface SeedConfig {
    /** Seed for model creation. */
    readonly model?: string;
    /** Seed for generating the battle sim PRNGs. */
    readonly battle?: string;
    /** Seed for generating the random team PRNGs. */
    readonly team?: string;
    /** Seed for random exploration in epsilon-greedy policy. */
    readonly explore?: string;
    /** Seed for shuffling training examples during the learning step. */
    readonly learn?: string;
}

/** Executes the training procedure with the given config. */
export async function train({
    name,
    config,
    models,
    games,
    logger,
    seeds,
    progress,
    resume,
}: TrainArgs): Promise<void> {
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
                seeds?.model,
            );

            logger.info("Saving new model as latest");
            await ensureDir(latestModelPath);
            await models.save(model, latestModelUrl);
        }
    } else {
        logger.info("Creating default model");
        model = await models.load(
            "model",
            config.train.batchPredict,
            undefined /*url*/,
            seeds?.model,
        );

        logger.info("Saving new model as latest");
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

    const seed: EpisodeSeedRandomArgs | undefined = seeds && {
        ...(seeds.battle && {battle: createSeedGenerator(seeds.battle)}),
        ...(seeds.team && {team: createSeedGenerator(seeds.team)}),
        ...(seeds.explore && {explore: createSeedGenerator(seeds.explore)}),
        ...(seeds.learn && {learn: createSeedGenerator(seeds.learn)}),
    };

    // Train network.
    for (let step = 1; step <= config.train.numEpisodes; ++step) {
        const episodeLog = logger.addPrefix(
            `Episode(${step.toPrecision(
                Math.max(1, Math.ceil(Math.log10(config.train.numEpisodes))),
            )}/${config.train.numEpisodes}): `,
        );

        const logPromise = models.log(name, step, {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "rollout/exploration": explore.factor,
        });
        const episodePromise = episode({
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
            gameConfig: config.train.game,
            learnConfig: config.train.learn,
            logger: episodeLog,
            logPath: path.join(config.paths.logs, `episode-${step}`),
            ...(seed && {seed}),
            progress,
        });
        await Promise.all([logPromise, episodePromise]);

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
        await models.copy(model, previousModel);
    }

    await Promise.all([models.unload(model), models.unload(previousModel)]);
}

function createSeedGenerator(seed: string): () => string {
    let i = 0;
    return () => hash(seed + String(i++));
}
