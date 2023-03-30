import * as tf from "@tensorflow/tfjs";
import {ExperienceConfig, RolloutConfig} from "../config/types";
import {Experience} from "../game/experience";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../game/pool";
import {BatchPredict} from "../model/worker/BatchPredict";
import {Metrics} from "../model/worker/Metrics";
import {ModelRegistry} from "../model/worker/ModelRegistry";
import {serializeModel} from "../util/model";
import {rng, Seeder} from "../util/random";

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

    /** Batch predict profile for rollout model. */
    private profile?: BatchPredict;
    /** Batch predict profile for previous model. */
    private prevProfile?: BatchPredict;

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
     * @param expConfig Config for generating experience.
     * @param logPath Path to the folder to store games logs in. Omit to not
     * store logs.
     * @param seeders Random seed generators.
     */
    public constructor(
        public readonly name: string,
        private readonly model: ModelRegistry,
        private readonly prevModel: ModelRegistry,
        private readonly config: RolloutConfig,
        private readonly expConfig: ExperienceConfig,
        private readonly logPath?: string,
        private readonly seeders?: RolloutSeeders,
    ) {
        this.games = new GamePipeline(`${name}/rollout`, config.pool);
        this.exploration = {factor: config.policy.exploration};
    }

    /** Ensures models are loaded onto the game workers. */
    public async ready(): Promise<void> {
        await Promise.all(
            [
                [this.model, this.config.serve, "profile"] as const,
                [this.prevModel, this.config.servePrev, "prevProfile"] as const,
            ].map(async ([model, serve, field]) => {
                switch (serve.type) {
                    case "batched":
                        this[field] = model.configure("rollout", serve);
                        await this.games.registerModelPort(model.name, () =>
                            model.subscribe("rollout"),
                        );
                        break;
                    case "distributed":
                        await this.games.loadModel(
                            model.name,
                            await serializeModel(model.model),
                            serve,
                        );
                        break;
                }
            }),
        );
    }

    /** Reloads any models that are stored on game workers. */
    public async reload(which?: string): Promise<void> {
        await Promise.all(
            [
                [this.model, this.config.serve] as const,
                [this.prevModel, this.config.servePrev] as const,
            ].map(async ([model, serve]) => {
                if (serve.type !== "distributed") {
                    return;
                }
                if (which && model.name !== which) {
                    return;
                }
                const {data} = await tf.io.encodeWeights(
                    model.model.weights.map(w => ({
                        name: w.name,
                        tensor: w.read(),
                    })),
                );
                await this.games.reloadModel(model.name, data);
            }),
        );
    }

    /** Force-closes game threads. */
    public async terminate(): Promise<void> {
        if (this.profile) {
            // TODO: Force cancel predict requests instead of awaiting them.
            await this.model.deconfigure("rollout");
            this.profile = undefined;
        }
        if (this.prevProfile) {
            await this.prevModel.deconfigure("rollout");
            this.prevProfile = undefined;
        }
        return await this.games.terminate();
    }

    /**
     * Runs the rollout stage and collects experience from game workers.
     *
     * @param callback Called for each game result.
     */
    public async *run(
        callback?: (result: GamePoolResult) => void,
    ): AsyncGenerator<Experience> {
        const p = this.games.run(this.genArgs(), result => {
            ++this.numGames;
            if (result.winner === undefined) {
                ++this.numTies;
            }
            callback?.(result);
        });
        yield* this.games.collectExperience();
        await p;
    }

    /**
     * Updates the exploration rate for future games and logs metrics to prepare
     * for the next learning step.
     */
    public async step(step: number): Promise<void> {
        if (this.metrics && step % this.config.metricsInterval === 0) {
            this.metrics.scalar("exploration", this.exploration.factor, step);
            if (this.numGames > 0) {
                this.metrics.scalar("total_games", this.numGames, step);
                this.metrics.scalar(
                    "tie_ratio",
                    this.numTies / this.numGames,
                    step,
                );
            }
        }

        this.exploration.factor =
            this.config.policy.exploration -
            ((this.config.policy.exploration -
                this.config.policy.minExploration) *
                step) /
                this.config.policy.interpolate;
        if (this.exploration.factor < this.config.policy.minExploration) {
            this.exploration.factor = this.config.policy.minExploration;
        }

        if (step % this.config.updateInterval === 0) {
            await this.reload("rollout");
        }
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(): Generator<GamePoolArgs> {
        const opts: GameArgsGenOptions = {
            agentConfig: {
                name: "rollout",
                exploit: {type: "model", model: this.model.name},
                // Use object reference so that step() updates with the new rate
                // for newly-created games
                explore: this.exploration,
                emitExperience: true,
            },
            opponent: {
                name: "self",
                exploit: {type: "model", model: this.model.name},
                explore: this.exploration,
                emitExperience: true,
            },
            ...(this.logPath !== undefined && {logPath: this.logPath}),
            ...(this.config.pool.reduceLogs && {reduceLogs: true}),
            ...(this.expConfig && {experienceConfig: this.expConfig}),
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
            if (random() < this.config.prevRatio) {
                yield prevGen.next().value;
            } else {
                yield gen.next().value;
            }
        }
    }
}
