import {join} from "path";
import {EvalConfig} from "../config/types";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../game/pool";
import {Metrics} from "../model/worker/Metrics";
import {ModelRegistry} from "../model/worker/ModelRegistry";

/** Result of playing evaluation games against an opponent. */
export interface EvalResult {
    /** Name of opponent. */
    opponent: string;
    /** Number of won games against opponent. */
    win: number;
    /** Number of lost games against opponent. */
    loss: number;
    /** Number of ties against opponent. */
    tie: number;
    /** Total number of games against opponent. */
    total: number;
}

/**
 * Encapsulates the evaluation step of training, where the model plays games
 * against baselines and previous versions to track improvement over time.
 */
export class Evaluate {
    /** Metrics logger. */
    private readonly metrics = Metrics.get(`${this.name}/eval`);
    /** Used to manage eval game threads. */
    private readonly games: GamePipeline;

    /**
     * Creates an Evaluate object.
     *
     * @param name Name of the training run.
     * @param model Model to evaluate.
     * @param prevModel Previous version to use as a baseline.
     * @param config Configuration for the evaluation step.
     * @param logPath Path to the folder to store games logs in. Omit to not
     * store logs.
     * @param seeders Random seed generators.
     */
    public constructor(
        public readonly name: string,
        private readonly model: ModelRegistry,
        private readonly prevModel: ModelRegistry,
        private readonly config: EvalConfig,
        private readonly logPath?: string,
        private readonly seeders?: GameArgsGenSeeders,
    ) {
        this.games = new GamePipeline(config.pool);
    }

    /** Closes game threads. */
    public async close(): Promise<void> {
        return await this.games.close();
    }

    /** Force-closes game threads. */
    public async terminate(): Promise<void> {
        return await this.games.terminate();
    }

    /**
     * Runs the evaluation step on the current model versions.
     *
     * @param step Current learning step.
     * @param gameCallback Called for each game result.
     * @param callback Called for each opponent after completing games.
     */
    public async run(
        step: number,
        gameCallback?: (result: GamePoolResult) => void,
        callback?: (result: EvalResult) => void,
    ): Promise<void> {
        const results: {[vs: string]: EvalResult} = {};
        await this.games.run(this.genArgs(step), gameResult => {
            const [, vs] = gameResult.agents;
            const result = (results[vs] ??= {
                opponent: vs,
                win: 0,
                loss: 0,
                tie: 0,
                total: 0,
            });
            ++result.total;
            if (gameResult.winner === 0) {
                ++result.win;
            } else if (gameResult.winner === 1) {
                ++result.loss;
            } else {
                ++result.tie;
            }
            gameCallback?.(gameResult);
            if (result.total >= this.config.numGames) {
                callback?.(result);
                if (this.metrics) {
                    this.metrics.scalar(
                        `${vs}/win_avg`,
                        result.win / result.total,
                        step,
                    );
                    this.metrics.scalar(
                        `${vs}/loss_avg`,
                        result.loss / result.total,
                        step,
                    );
                    this.metrics.scalar(
                        `${vs}/tie_avg`,
                        result.tie / result.total,
                        step,
                    );
                }
            }
        });
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(step: number): Generator<GamePoolArgs> {
        const opts: Omit<GameArgsGenOptions, "opponent"> = {
            agentConfig: {
                name: "evaluate",
                exploit: {type: "model", model: this.model.name},
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
            numGames: this.config.numGames,
            ...(this.logPath !== undefined && {
                logPath: join(this.logPath, `step-${step}`),
            }),
            ...(this.config.pool.reduceLogs && {reduceLogs: true}),
            ...(this.seeders && {seeders: this.seeders}),
        };

        yield* GamePipeline.genArgs({
            ...opts,
            opponent: {
                name: "previous",
                exploit: {type: "model", model: this.prevModel.name},
            },
        });
        yield* GamePipeline.genArgs({
            ...opts,
            opponent: {name: "random", exploit: {type: "random"}},
        });
    }
}
