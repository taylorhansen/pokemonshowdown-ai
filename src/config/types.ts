import {Verbose} from "../util/logging/Verbose";

/** Config typings. */
export interface Config {
    /** PsBot config. */
    readonly psbot: PsBotConfig;
    /** Paths config. */
    readonly paths: PathsConfig;
    /** TensorFlow config. */
    readonly tf: TensorflowConfig;
    /** Training config. */
    readonly train: TrainConfig;
    /** Model comparison script config. */
    readonly compare: CompareConfig;
}

/**
 * Configuration for the PsBot.
 *
 * @see {@link Config}
 */
export interface PsBotConfig {
    /** Account username. If unspecified, use a guest account. */
    readonly username?: string;
    /** Account password. If unspecified, attempt to login without it. */
    readonly password?: string;
    /** Specify profile avatar. */
    readonly avatar?: string;
    /** Url for the server used to login to an account. */
    readonly loginUrl: string;
    /** Websocket route to the PS server used for actual play. */
    readonly websocketRoute: string;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/**
 * Paths to various directories.
 *
 * @see {@link Config}
 */
export interface PathsConfig {
    /** Path to the directory containing the models. */
    readonly models: string;
    /** Path to the directory containing the logs. */
    readonly logs: string;
}

/**
 * Configuration for TensorFlow.
 *
 * @see {@link Config}
 */
export interface TensorflowConfig {
    /** Whether to use the GPU. */
    readonly gpu: boolean;
}

/**
 * Configuration for the training process.
 *
 * @see {@link Config}
 */
export interface TrainConfig {
    /** Number of training episodes to complete. */
    readonly numEpisodes: number;
    /** Batch predict config. */
    readonly batchPredict: BatchPredictConfig;
    /** Game config. */
    readonly game: GameConfig;
    /** Rollout config. */
    readonly rollout: RolloutConfig;
    /** Evaluation config. */
    readonly eval: EvalConfig;
    /** Learning config. */
    readonly learn: LearnConfig;
    /** RNG config. */
    readonly seeds?: TrainSeedConfig;
    /**
     * Whether to save each previous version of the model separately after each
     * training step.
     *
     * Not recommended if running on limited disk space.
     */
    readonly savePreviousVersions: boolean;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/**
 * Configuration for batch predict.
 *
 * @see {@link TrainConfig}
 */
export interface BatchPredictConfig {
    /** Maximum size of a batch. */
    readonly maxSize: number;
    /**
     * Max amount of time to wait until the next batch should be processed, in
     * nanoseconds.
     */
    readonly timeoutNs: bigint;
}

/**
 * Configuration for the game.
 *
 * @see {@link TrainConfig}
 */
export interface GameConfig {
    /** Number of games to play in parallel. */
    readonly numThreads: number;
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns: number;
    /**
     * Soft cap on how many game results each worker can keep in memory before
     * writing them to disk.
     */
    readonly highWaterMark?: number;
}

/**
 * Configuration for the rollout process.
 *
 * @see {@link TrainConfig}
 */
export interface RolloutConfig {
    /** Number of games to play against self. */
    readonly numGames: number;
    /** Exploration policy config. */
    readonly policy: PolicyConfig;
    /** Experience config. */
    readonly experience: ExperienceConfig;
}

/**
 * Configuration for the exploration policy during the rollout phase.
 *
 * @see {@link RolloutConfig}
 */
export interface PolicyConfig {
    /**
     * Initial value for the epsilon-greedy exploration policy. Specifies the
     * proportion of actions to take randomly rather than consulting the model.
     */
    readonly exploration: number;
    /**
     * Exploration (epsilon) decay factor. Applied after each full episode of
     * training.
     */
    readonly explorationDecay: number;
    /** Minumum exploration (epsilon) value. */
    readonly minExploration: number;
}

/**
 * Configuration for generating experience from rollout games.
 *
 * @see {@link RolloutConfig}
 */
export interface ExperienceConfig {
    /** Discount factor for future rewards. */
    readonly rewardDecay: number;
}

/**
 * Configuration for the evaluation process.
 *
 * @see {@link TrainConfig}
 */
export interface EvalConfig {
    /** Number of games to play against each ancestor. */
    readonly numGames: number;
    /** Statistical test config. */
    readonly test?: EvalTestConfig;
}

/**
 * Configuration for the statistical test used during evaluation.
 *
 * @see {@link EvalConfig}
 */
export interface EvalTestConfig {
    /**
     * Name of the eval opponent(s) to test the updated model against. The model
     * must be proven to be better than each opponent in order to be accepted.
     */
    readonly against: string | string[];
    /**
     * Minimum ratio of wins to total games in order to accept the updated
     * model.
     */
    readonly minScore: number;
    /**
     * Whether to count ties as wins in the test. Otherwise they are counted as
     * losses.
     */
    readonly includeTies?: boolean;
}

/**
 * Configuration for the learning process.
 *
 * @see {@link TrainConfig}
 */
export interface LearnConfig {
    /** Number of epochs to train for. */
    readonly epochs: number;
    /** Number of tfrecord decoder threads. */
    readonly numDecoderThreads: number;
    /** Batch size for learning step. */
    readonly batchSize: number;
    /** Buffer size for shuffling training examples. */
    readonly shufflePrefetch: number;
    /** Optimizer learning rate. */
    readonly learningRate: number;
}

/**
 * Configuration for random number generators in the training script.
 *
 * @see {@link TrainConfig}
 */
export interface TrainSeedConfig {
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

/**
 * Configuration for the model comparison script.
 *
 * @see {@link Config}
 */
export interface CompareConfig {
    /**
     * Models to compare from the {@link PathsConfig.models} directory. Can also
     * use the string `"random"` to refer to a custom randomly-playing opponent.
     */
    readonly models: readonly string[];
    /** Number of games to play in parallel. */
    readonly numThreads: number;
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns: number;
    /** Number of games to play for each matchup. */
    readonly numGames: number;
    /**
     * Significance threshold for the test when comparing win/loss ratios. If
     * two models compete, one of them must have a win/loss ratio of at least
     * `threshold` in order to be considered "better", otherwise the models will
     * be treated as being no better than each other.
     *
     * Note that if this is equal to or below 0.5, it's possible for two models
     * to be considered better than each other, counting as a win for both of
     * them (rather than a tie) if it was a close match.
     */
    readonly threshold: number;
    /** Batch predict config. */
    readonly batchPredict: BatchPredictConfig;
    /** RNG config. */
    readonly seeds?: CompareSeedConfig;
}

/**
 * Configuration for random number generators in the comparison script.
 *
 * @see {@link CompareConfig}
 */
export interface CompareSeedConfig {
    /** Seed for generating the battle sim PRNGs. */
    readonly battle?: string;
    /** Seed for generating the random team PRNGs. */
    readonly team?: string;
    /** Seed for random opponents. */
    readonly explore?: string;
}
