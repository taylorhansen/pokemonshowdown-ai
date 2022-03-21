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
}

/**
 * Paths to various directories.
 *
 * @see {@link Config}
 */
export interface PathsConfig {
    /** Path to the directory containing the models. */
    readonly models: string;
    /** Path to the directory containing the latest model. */
    readonly latestModel: string;
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
    readonly gpu?: boolean;
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
