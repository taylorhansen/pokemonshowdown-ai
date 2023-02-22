import {ResourceLimits} from "worker_threads";
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
    /** Batch predict config for the model. */
    readonly batchPredict: BatchPredictConfig;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/** Paths to various directories. */
export interface PathsConfig {
    /** Path to the directory containing the models. */
    readonly models: string;
    /** Path to the directory containing the logs. */
    readonly logs: string;
    /** Path to the directory containing the TensorBoard metrics. */
    readonly metrics: string;
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
    /** Number of learning steps. Omit or set to zero to train indefinitely. */
    readonly steps?: number;
    /** Batch predict config for models outside the learning step. */
    readonly batchPredict: BatchPredictConfig;
    /** Model config. */
    readonly model: ModelConfig;
    /** Rollout config. */
    readonly rollout: RolloutConfig;
    /** Experience config. */
    readonly experience: ExperienceConfig;
    /** Learning config. */
    readonly learn: LearnConfig;
    /** Evaluation config. */
    readonly eval: EvalConfig;
    /** RNG config. */
    readonly seeds?: TrainSeedConfig;
    /**
     * Whether to save model checkpoints as separate versions. If false, only
     * the latest model version will be saved.
     */
    readonly savePreviousVersions?: boolean;
    /**
     * Step interval for saving model checkpoints if {@link PathsConfig.models}
     * is defined. Omit to not store checkpoints.
     */
    readonly checkpointInterval?: number;
    /** Whether to display a progress bar if {@link steps} is also defined. */
    readonly progress?: boolean;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
    /** Optional resource constraints for the TF thread. */
    readonly resourceLimits?: ResourceLimits;
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

/** Configuration for the neural network model. */
export interface ModelConfig {
    /** Whether to use dueling network architecture. */
    dueling?: boolean;
    /**
     * If defined, creates a distributional Q network instead of a regular one,
     * with the number specifying the number of atoms with which to construct
     * the support of the reward distribution.
     */
    dist?: number;
}

/** Configuration for the rollout process. */
export interface RolloutConfig {
    /** Game pool config. */
    readonly pool: GamePoolConfig;
    /** Exploration policy config. */
    readonly policy: PolicyConfig;
    /**
     * Fraction of self-play games that should by played against the model's
     * previous version rather than itself.
     *
     * The previous version is defined by the last {@link EvalConfig eval} step.
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
    /** Optional resource constraints for the game threads. */
    readonly resourceLimits?: ResourceLimits;
}

/** Configuration for the exploration policy during the rollout phase. */
export interface PolicyConfig {
    /**
     * Initial value for the epsilon-greedy exploration policy. Specifies the
     * proportion of actions to take randomly rather than consulting the model.
     */
    readonly exploration: number;
    /** Minumum exploration (epsilon) value. */
    readonly minExploration: number;
    /**
     * Number of steps over which to linearly decay {@link exploration} down to
     * {@link minExploration}.
     */
    readonly interpolate: number;
}

/** Configuration for learning on experience generated from rollout games. */
export interface ExperienceConfig {
    /** Discount factor for future rewards, aka gamma. */
    readonly rewardDecay: number;
    /**
     * Number of lookahead steps for experience generation, minimum 1. This is
     * the n in n-step returns for temporal difference (TD) learning. Can be set
     * to `Infinity` to mimic Monte Carlo (MC) returns which use the full
     * discount reward sum.
     */
    readonly steps: number;
    /** Size of the experience replay buffer. */
    readonly bufferSize: number;
    /**
     * Minimum number of experiences to generate before starting training. Must
     * be at least as big as the {@link LearnConfig.batchSize batch size}.
     */
    readonly prefill: number;
}

/** Configuration for the learning process. */
export interface LearnConfig {
    /** Neural network optimizer config. */
    readonly optimizer: OptimizerConfig;
    /** Batch size. */
    readonly batchSize: number;
    /**
     * Whether to use a target network to increase training stability, or
     * `"double"` to implement double Q learning approach using the target net.
     */
    readonly target: boolean | "double";
    /** Step interval for sampling a batch and updating the network. */
    readonly interval: number;
    /** Step interval for updating the target network. */
    readonly targetInterval: number;
    /**
     * Step interval for tracking update metrics such as loss and
     * gradient/weight histograms, which can significantly slow down training if
     * collected too frequently. Must be divisible by {@link interval}.
     */
    readonly metricsInterval: number;
    /**
     * Whether to report loss to the main thread every {@link metricsInterval}
     * steps.
     */
    readonly report?: boolean;
}

interface OptimizerConfigBase<T extends string> {
    /** Type of optimizer. */
    readonly type: T;
}

/** Configuration for SGD optimizer. */
export interface SgdConfig extends OptimizerConfigBase<"sgd"> {
    /** Learning rate for stochastic gradient descent. */
    readonly learningRate: number;
}

/** Configuration for RMSProp optimizer. */
export interface RmsPropConfig extends OptimizerConfigBase<"rmsprop"> {
    /** Learning rate for gradient descent. */
    readonly learningRate: number;
    /** Discounting factor for the coming gradient. */
    readonly decay?: number;
    /** Momentum to use for gradient descent. */
    readonly momentum?: number;
}

/** Configuration for Adam optimizer. */
export interface AdamConfig extends OptimizerConfigBase<"adam"> {
    /** Learning rate for gradient descent. */
    readonly learningRate?: number;
    /** Exponential decay rate for the 1st moment estimates. */
    readonly beta1?: number;
    /** Exponential decay rate for the 2nd moment estimates. */
    readonly beta2?: number;
}

/** Configuration for the neural network optimizer. */
export type OptimizerConfig = SgdConfig | RmsPropConfig | AdamConfig;

/** Configuration for the evaluation process. */
export interface EvalConfig {
    /** Number of games to play against each eval opponent. */
    readonly numGames: number;
    /** Game pool config. */
    readonly pool: GamePoolConfig;
    /** Step interval for performing model evaluations. */
    readonly interval: number;
    /**
     * Whether to report game results to the main thread every {@link interval}
     * steps. Otherwise, only errors are reported.
     */
    readonly report?: boolean;
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
