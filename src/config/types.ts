import {ResourceLimits} from "worker_threads";
import {Verbose} from "../util/logging/Verbose";

/** Config typings. */
export interface Config {
    /** PsBot config. */
    readonly psbot: PsBotConfig;
    /** Paths config. */
    readonly paths: PathsConfig;
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
    /** TensorFlow config. */
    readonly tf: TensorflowConfig;
    /** Name of the model to serve. */
    readonly model: string;
    /** Batch predict config for the model. */
    readonly batchPredict: BatchPredictConfig;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
}

/** Configuration for the TensorFlow instance. */
export interface TensorflowConfig {
    /** Backend to use. */
    readonly backend: TfBackendConfig;
    /**
     * If {@link backend} is `tensorflow`, whether to use CUDA (requires a
     * compatible GPU).
     */
    readonly gpu?: boolean;
    /**
     * If {@link backend} is `wasm`, limits the amount of threads used by the TF
     * instance.
     */
    readonly numThreads?: number;
}

/** Config for selecting the TF backend on the current thread. */
export type TfBackendConfig = "cpu" | "tensorflow" | "wasm";

/** Configuration for batching several parallel inferences into one. */
export interface BatchPredictConfig {
    /** Maximum size of a batch. */
    readonly maxSize: number;
    /**
     * Max amount of time to wait until the next batch should be processed, in
     * nanoseconds.
     */
    readonly timeoutNs: bigint;
}

/** Paths to various directories. */
export interface PathsConfig {
    /** Path to the directory containing the models. */
    readonly models: string;
    /** Path to the directory containing the logs. */
    readonly logs: string;
    /**
     * Path to the directory containing the TensorBoard metrics. Omit to
     * completely disable metrics.
     */
    readonly metrics?: string;
}

/** Configuration for the training process. */
export interface TrainConfig {
    /** Name of the training run under which to store logs. */
    readonly name: string;
    /** TensorFlow config for the learner instance. */
    readonly tf: TensorflowConfig;
    /** Number of learning steps. Omit or set to zero to train indefinitely. */
    readonly steps?: number;
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
     * the latest model version will be saved. Applies every
     * {@link checkpointInterval} steps.
     */
    readonly savePreviousVersions?: boolean;
    /**
     * Step interval for saving model checkpoints if {@link PathsConfig.models}
     * is defined. Set to zero to disable. Still always saves the latest version
     * of the model on the last step.
     */
    readonly checkpointInterval: number;
    /**
     * Step interval for miscellaneous metrics, currently just memory usage. Set
     * to zero to disable.
     */
    readonly metricsInterval: number;
    /** Whether to display a progress bar if {@link steps} is also defined. */
    readonly progress?: boolean;
    /** Verbosity level for logging. Default highest. */
    readonly verbose?: Verbose;
    /** Optional resource constraints for the TF thread. */
    readonly resourceLimits?: ResourceLimits;
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
    /** Config for serving the current main model. */
    readonly serve: ModelServeConfig;
    /** Config for serving the previous model. */
    readonly servePrev: ModelServeConfig;
    /**
     * Fraction of self-play games that should by played against the model's
     * previous version rather than itself.
     *
     * The previous version is defined by the last {@link EvalConfig eval} step.
     */
    readonly prevRatio: number;
    /**
     * Step interval for reloading the main model stored on each of the game
     * threads after a number of gradient updates. Should be divisible by
     * {@link LearnConfig.interval}. Required if {@link serve} has
     * `type="distributed"`. Set to zero to disable.
     */
    readonly updateInterval: number;
    /**
     * Step interval for tracking metrics such as exploration rate and game
     * stats. Set to zero to disable.
     */
    readonly metricsInterval: number;
}

/** Configuration for serving a model in game workers. */
export interface ModelServeConfig extends BatchPredictConfig {
    /**
     * Type of predict scheme to use.
     * - `"batched"`: Game threads are given a message port into the model
     *   hosted on the main learner thread, and requests are batched and
     *   executed all at once. This can block the main learner thread while the
     *   game threads spend most of their time idle.
     * - `"distributed"`: Game threads keep a separate copy of the model which
     *   the main learner thread will periodically send updates to. This is
     *   likely to be non-blocking and increase utilization of all threads.
     */
    readonly type: "batched" | "distributed";
}

/** Configuration for the thread pool for playing games. */
export interface GamePoolConfig {
    /** Number of threads to use for parallel games. */
    readonly numThreads: number;
    /** Number of games to simulate per thread. Used in async batch ops. */
    readonly gamesPerThread: number;
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
    /**
     * Tensorflow config for the rollout threads. Required if a related
     * {@link ModelServeConfig} has `type="distributed"`.
     */
    readonly tf?: TensorflowConfig;
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
    /**
     * Step interval for logging replay buffer metrics to TensorBoard. Set to
     * zero to disable.
     */
    readonly metricsInterval: number;
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
    /**
     * Step interval for updating the target network. Should be much larger than
     * {@link interval}, and also preferably divisible by it to ensure an equal
     * number of gradient updates between target network updates.
     */
    readonly targetInterval: number;
    /**
     * Step interval for logging loss metrics to TensorBoard. Must be divisible
     * by {@link interval}. Set to zero to disable.
     */
    readonly metricsInterval: number;
    /**
     * Step interval for logging expensive weight histograms, which can
     * significantly slow down training and burden memory if collected too
     * frequently. Set to zero to disable.
     */
    readonly histogramInterval: number;
    /**
     * Step interval for reporting the loss to the main thread for inclusion in
     * the console progress bar (if {@link TrainConfig.progress enabled}). Must
     * be divisible by {@link interval}. Set to zero to disable.
     */
    readonly reportInterval: number;
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
    /** Config for serving the frozen evaluation model. */
    readonly serve: ModelServeConfig;
    /** Config for serving the previous model. */
    readonly servePrev: ModelServeConfig;
    /**
     * Step interval for performing model evaluations and logging stats to
     * TensorBoard. Set to zero to disable.
     */
    readonly interval: number;
    /**
     * Step interval for recording batch predict metrics during the evaluate
     * step. Must be divisible by {@link interval}. Set to zero to disable.
     */
    readonly predictMetricsInterval: number;
    /**
     * Whether to report game results to the main thread every {@link interval}
     * steps. Otherwise, only errors are reported.
     */
    readonly report?: boolean;
    /**
     * Whether to run the evaluation step synchronously, otherwise runs in
     * parallel with the rollout and learn steps. Setting this to true can help
     * with controlling CPU or GPU usage.
     */
    readonly sync?: boolean;
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
    /** TensorFlow config. */
    readonly tf: TensorflowConfig;
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
    /** Batch predict config for loaded models. */
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
