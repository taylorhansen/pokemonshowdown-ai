import {RolloutConfig} from "../config/types";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../game/pool";
import {Metrics} from "../model/worker/Metrics";
import {ModelRegistry} from "../model/worker/ModelRegistry";
import {rng, Seeder} from "../util/random";
import {RolloutModel} from "./RolloutModel";

/** Seeders for {@link Rollout}. */
export interface RolloutSeeders extends GameArgsGenSeeders {
    /** Random seed generator for opponent selection. */
    readonly rollout?: Seeder;
}

/**
 * Encapsulates the rollout part of training, where the model plays games
 * against itself to generate experience to train over.
 */
export class Rollout {
    /** Metrics logger. */
    private readonly metrics = Metrics.get(`${this.name}/rollout`);
    /** Used to manage rollout game threads. */
    private readonly games: GamePipeline;

    /** Current exploration factor for the agent. */
    private readonly exploration: {factor: number};
    /** Counter for number of games played for the training run. */
    private numGames = 0;
    /** Number of ties during the training run. */
    private numTies = 0;

    /**
     * Creates a Rollout object.
     *
     * @param name Name of the training run for logging.
     * @param model Model to run self-play games with.
     * @param prevModel Previous model version that will sometimes play against
     * the main model.
     * @param config Configuration for the rollout step.
     * @param logPath Path to the folder to store games logs in. Omit to not
     * store logs.
     * @param seeders Random seed generators.
     */
    public constructor(
        public readonly name: string,
        private readonly rolloutModel: RolloutModel,
        private readonly prevModel: ModelRegistry,
        private readonly config: RolloutConfig,
        private readonly logPath?: string,
        private readonly seeders?: RolloutSeeders,
    ) {
        this.games = new GamePipeline(config.pool);
        this.exploration = {factor: config.policy.exploration};
    }

    /** Force-closes game threads. */
    public async terminate(): Promise<void> {
        return await this.games.terminate();
    }

    /**
     * Runs the rollout stage.
     *
     * @param callback Called for each game result.
     */
    public async run(
        callback?: (result: GamePoolResult) => void,
    ): Promise<void> {
        await this.games.run(this.genArgs(), result => {
            ++this.numGames;
            if (result.winner === undefined) {
                ++this.numTies;
            }
            callback?.(result);
        });
    }

    /**
     * Updates the exploration rate for future games and logs metrics to prepare
     * for the next learning step.
     */
    public step(step: number): void {
        this.metrics?.scalar("exploration", this.exploration.factor, step);
        this.exploration.factor *= this.config.policy.explorationDecay;
        if (this.exploration.factor < this.config.policy.minExploration) {
            this.exploration.factor = this.config.policy.minExploration;
        }

        if (this.numGames > 0) {
            this.metrics?.scalar("total_games", this.numGames, step);
            this.metrics?.scalar(
                "tie_ratio",
                this.numTies / this.numGames,
                step,
            );
        }
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(): Generator<GamePoolArgs> {
        const opts: GameArgsGenOptions = {
            agentConfig: {
                name: "rollout",
                exploit: {type: "model", model: this.rolloutModel.name},
                // Use object reference so that step() updates with the new rate
                // for newly-created games
                explore: this.exploration,
                emitExperience: true,
            },
            opponent: {
                name: "self",
                exploit: {type: "model", model: this.rolloutModel.name},
                explore: this.exploration,
                emitExperience: true,
            },
            requestModelPort: (model: string) => {
                switch (model) {
                    case this.rolloutModel.name:
                        return this.rolloutModel.subscribe();
                    case this.prevModel.name:
                        return this.prevModel.subscribe();
                    default:
                        throw new Error(`Invalid model name '${model}'`);
                }
            },
            ...(this.logPath !== undefined && {logPath: this.logPath}),
            ...(this.config.pool.reduceLogs && {reduceLogs: true}),
            ...(this.seeders && {seeders: this.seeders}),
        };
        const gen = GamePipeline.genArgs(opts);

        const prevOpts: GameArgsGenOptions = {
            ...opts,
            opponent: {
                name: "prev",
                exploit: {type: "model", model: this.prevModel.name},
            },
        };
        const prevGen = GamePipeline.genArgs(prevOpts);

        const random = rng(this.seeders?.rollout?.());
        while (true) {
            if (random() < this.config.prev) {
                yield prevGen.next().value;
            } else {
                yield gen.next().value;
            }
        }
    }
}
