import {PassThrough} from "stream";
import {RolloutConfig} from "../../../config/types";
import {TrainingExample} from "../../game/experience";
import {
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../../game/pool";
import {Metrics} from "./Metrics";
import {ModelRegistry} from "./ModelRegistry";

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
    private exploration: number;
    /** Counter for number of games played for the episode. */
    private numGames = 0;
    /** Number of ties during the episode. */
    private numTies = 0;

    /**
     * Creates a Rollout object.
     *
     * @param name Name of the training run for logging.
     * @param model Model to run.
     * @param config Configuration for the rollout step.
     * @param logPath Path to the folder to store games logs in. Omit to not
     * store logs.
     * @param seeders Random seed generators.
     */
    public constructor(
        public readonly name: string,
        private readonly model: ModelRegistry,
        private readonly config: RolloutConfig,
        private readonly logPath?: string,
        private readonly seeders?: GameArgsGenSeeders,
    ) {
        this.games = new GamePipeline(config.pool);
        this.exploration = config.policy.exploration;
    }

    /** Closes game threads. */
    public async cleanup(): Promise<void> {
        return await this.games.cleanup();
    }

    /** Generator for getting experience data from the training games. */
    public async *gen(
        callback?: (result: GamePoolResult) => void,
    ): AsyncGenerator<TrainingExample> {
        const stream = new PassThrough({objectMode: true, highWaterMark: 1});

        const run = this.games
            .run(this.genArgs(), async result => {
                ++this.numGames;
                if (result.winner === undefined) {
                    ++this.numTies;
                }
                callback?.(result);
                if (!stream.write(result)) {
                    await new Promise(res => stream.once("drain", res));
                }
            })
            .catch(e => void stream.emit("error", e))
            .finally(() => stream.end());

        for await (const result of stream) {
            const typed = result as GamePoolResult;
            for (const example of typed.examples ?? []) {
                yield example;
            }
        }
        await run;
    }

    /**
     * Updates the exploration rate for future games and logs metrics to prepare
     * for the next episode.
     */
    public step(step: number): void {
        this.metrics?.scalar("exploration", this.exploration, step);
        this.exploration *= this.config.policy.explorationDecay;
        if (this.exploration < this.config.policy.minExploration) {
            this.exploration = this.config.policy.minExploration;
        }

        this.metrics?.scalar("num_games", this.numGames, step);
        this.metrics?.scalar("tie_rate", this.numTies / this.numGames, step);
        this.numGames = 0;
        this.numTies = 0;
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(): Generator<GamePoolArgs> {
        for (const args of GamePipeline.genArgs({
            agentConfig: {
                name: "rollout",
                exploit: {
                    type: "model",
                    model: this.model.name,
                },
                explore: {
                    factor: this.exploration,
                },
                emitExperience: true,
            },
            opponents: [
                {
                    agentConfig: {
                        name: "self",
                        exploit: {
                            type: "model",
                            model: this.model.name,
                        },
                        explore: {
                            factor: this.exploration,
                        },
                        emitExperience: true,
                    },
                },
            ],
            requestModelPort: (model: string) => {
                if (model !== this.model.name) {
                    throw new Error(`Invalid model name '${model}'`);
                }
                return this.model.subscribe();
            },
            ...(this.logPath !== undefined && {logPath: this.logPath}),
            experienceConfig: this.config.experience,
            ...(this.seeders && {seeders: this.seeders}),
        })) {
            yield args;
        }
    }
}
