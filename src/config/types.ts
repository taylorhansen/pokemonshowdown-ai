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

/** Configuration for the PsBot. */
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
    /** Name of the model to serve. */
    readonly model: string;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/** Paths to various directories. */
export interface PathsConfig {
    /** Path to the directory containing the models. */
    readonly models: string;
    /** Path to the directory containing the logs. */
    readonly logs: string;
}

/** Configuration for TensorFlow. */
export interface TensorflowConfig {
    /** Whether to use the GPU. */
    readonly gpu: boolean;
}

/** Configuration for the training process. */
export interface TrainConfig {
    /** Name of the training run under which to store logs. */
    readonly name: string;
    /** Number of training episodes to complete. */
    readonly episodes: number;
    /** Batch predict config. */
    readonly batchPredict: BatchPredictConfig;
    /** Model config. */
    readonly model: ModelConfig;
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
     */
    readonly savePreviousVersions: boolean;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/**
 * Configuration for batch predict. This is for configuring how the main neural
 * network should handle making predictions for the multiple parallel games.
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
 * Configuration for the creation of the initial neural network model for
 * training does not work when resuming training from a previous session.
 */
export interface ModelConfig {
    /**
     * Whether to use a dueling network architecture rather than just vanilla
     * DQN.
     */
    readonly dueling: boolean;
    /** Config for aggregate operations on movesets and team lists. */
    readonly aggregate: Record<"move" | "pokemon", ModelAggregateConfig>;
}

/**
 * Configuration for the model's pooling architecture for certain unordered
 * inputs.
 */
export interface ModelAggregateConfig {
    /** Type of pooling scheme to use. */
    readonly type: ModelAggregateType;
    /** Whether to include an attention model before the aggregate operation. */
    readonly attention?: boolean;
}

/**
 * Type of pooling scheme to use for unordered input.
 *
 * * `"sum"` - Add all the features together elementwise.
 * * `"mean"` - Average features. Note that dead or zeroed-out inputs are
 * included in the average.
 * * `"max"` - Take the maximum of each feature.
 */
export type ModelAggregateType = "sum" | "mean" | "max";

/** Configuration for the rollout process. */
export interface RolloutConfig {
    /** Game pool config. */
    readonly pool: GamePoolConfig;
    /** Exploration policy config. */
    readonly policy: PolicyConfig;
    /**
     * Fraction of self-play games that should by played against the model's
     * previous version rather than itself.
     */
    readonly prev: number;
}

/** Configuration for the thread pool for playing games. */
export interface GamePoolConfig {
    /** Number of games to play in parallel. */
    readonly numThreads: number;
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both players only decide to switch.
     */
    readonly maxTurns?: number;
    /**
     * Exponentially reduces the amount of games that get to keep logs on disk.
     * Note that if a game encounters an error then it will always log to disk.
     */
    readonly reduceLogs?: boolean;
}

/** Configuration for the exploration policy during the rollout phase. */
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

/** Configuration for the evaluation process. */
export interface EvalConfig {
    /** Number of games to play against each eval opponent. */
    readonly numGames: number;
    /** Game pool config. */
    readonly pool: GamePoolConfig;
}

/** Configuration for the learning process. */
export interface LearnConfig {
    /** Number of batch updates before starting the next episode. */
    readonly updates: number;
    /** Optimizer learning rate. */
    readonly learningRate: number;
    /** Replay buffer config. */
    readonly buffer: BufferConfig;
    /** Experience config. */
    readonly experience: ExperienceConfig;
    /**
     * Whether to use a target network to increase training stability, or
     * `"double"` to implement double Q learning approach using the target net.
     */
    readonly target?: boolean | "double";
}

/** Configuration for the experience replay buffer. */
export interface BufferConfig {
    /** Number of experiences to buffer for shuffling. */
    readonly shuffle: number;
    /** Batch size for learning updates. */
    readonly batch: number;
    /** Number of batches to prefetch for learning. */
    readonly prefetch: number;
}

/** Configuration for learning on experience generated from rollout games. */
export interface ExperienceConfig {
    /** Discount factor for future rewards. */
    readonly rewardDecay: number;
}

/** Configuration for random number generators in the training script. */
export interface TrainSeedConfig {
    /** Seed for model creation. */
    readonly model?: string;
    /** Seed for generating the battle sim PRNGs. */
    readonly battle?: string;
    /** Seed for generating the random team PRNGs. */
    readonly team?: string;
    /** Seed for random opponent selection during rollout games. */
    readonly rollout?: string;
    /** Seed for random exploration in epsilon-greedy policy. */
    readonly explore?: string;
    /** Seed for shuffling training examples during the learning step. */
    readonly learn?: string;
}

/** Configuration for the model comparison script. */
export interface CompareConfig {
    /** Name of the training run under which to store logs. */
    readonly name: string;
    /**
     * Models to compare from the {@link PathsConfig.models} directory. Can also
     * use the string `"random"` to refer to a custom randomly-playing opponent.
     */
    readonly models: readonly string[];
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
    /** Game pool config. */
    readonly pool: GamePoolConfig;
    /** RNG config. */
    readonly seeds?: CompareSeedConfig;
}

/** Configuration for random number generators in the comparison script. */
export interface CompareSeedConfig {
    /** Seed for generating the battle sim PRNGs. */
    readonly battle?: string;
    /** Seed for generating the random team PRNGs. */
    readonly team?: string;
    /** Seed for random opponents. */
    readonly explore?: string;
}
