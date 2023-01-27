import {PassThrough} from "stream";
import {RolloutConfig} from "../../../config/types";
import {rng, Seeder} from "../../../util/random";
import {Experience} from "../../game/experience";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../../game/pool";
import {Metrics} from "./Metrics";
import {ModelRegistry} from "./ModelRegistry";

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
    /** Counter for number of games played for the episode. */
    private numGames = 0;
    /** Number of ties during the episode. */
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
        private readonly model: ModelRegistry,
        private readonly prevModel: ModelRegistry,
        private readonly config: RolloutConfig,
        private readonly logPath?: string,
        private readonly seeders?: RolloutSeeders,
    ) {
        this.games = new GamePipeline(config.pool);
        this.exploration = {factor: config.policy.exploration};
    }

    /** Closes game threads. */
    public async cleanup(): Promise<void> {
        return await this.games.cleanup();
    }

    /** Generator for getting experience data from the training games. */
    public async *gen(
        callback?: (result: GamePoolResult) => void,
    ): AsyncGenerator<Experience> {
        const stream = new PassThrough({objectMode: true, highWaterMark: 1});

        const run = this.games
            .run(
                this.genArgs(exp => stream.write(exp)),
                async result => {
                    ++this.numGames;
                    if (result.winner === undefined) {
                        ++this.numTies;
                    }
                    callback?.(result);
                    // Need to check for backpressure.
                    if (!stream.write(undefined)) {
                        await new Promise(res => stream.once("drain", res));
                    }
                },
            )
            .catch(e => void stream.emit("error", e))
            .finally(() => stream.end());

        for await (const exp of stream) {
            if (exp) {
                yield exp as Experience;
            }
        }
        await run;
    }

    /**
     * Updates the exploration rate for future games and logs metrics to prepare
     * for the next episode.
     */
    public step(step: number): void {
        this.metrics?.scalar("exploration", this.exploration.factor, step);
        this.exploration.factor *= this.config.policy.explorationDecay;
        if (this.exploration.factor < this.config.policy.minExploration) {
            this.exploration.factor = this.config.policy.minExploration;
        }

        this.metrics?.scalar("num_games", this.numGames, step);
        this.metrics?.scalar("tie_rate", this.numTies / this.numGames, step);
        this.numGames = 0;
        this.numTies = 0;
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(
        experienceCallback?: (exp: Experience) => void,
    ): Generator<GamePoolArgs> {
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
            requestModelPort: (model: string) => {
                switch (model) {
                    case this.model.name:
                        return this.model.subscribe();
                    case this.prevModel.name:
                        return this.prevModel.subscribe();
                    default:
                        throw new Error(`Invalid model name '${model}'`);
                }
            },
            ...(this.logPath !== undefined && {logPath: this.logPath}),
            ...(this.config.pool.reduceLogs && {reduceLogs: true}),
            ...(this.seeders && {seeders: this.seeders}),
            ...(experienceCallback && {experienceCallback}),
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
