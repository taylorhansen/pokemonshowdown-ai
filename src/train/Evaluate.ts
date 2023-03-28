import {join} from "path";
import * as tf from "@tensorflow/tfjs";
import {EvalConfig} from "../config/types";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
    GamePoolArgs,
    GamePoolResult,
} from "../game/pool";
import {GameAgentConfig} from "../game/pool/worker";
import {BatchPredict} from "../model/worker/BatchPredict";
import {Metrics} from "../model/worker/Metrics";
import {ModelRegistry} from "../model/worker/ModelRegistry";
import {serializeModel} from "../util/model";

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

    /** Batch predict profile for eval model. */
    private profile?: BatchPredict;
    /** Batch predict profile for previous model. */
    private prevProfile?: BatchPredict;

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
        this.games = new GamePipeline(`${name}/eval`, config.pool);
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
                        this[field] = model.configure("eval", serve);
                        await this.games.registerModelPort(model.name, () =>
                            model.subscribe("eval"),
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
    public async reload(): Promise<void> {
        await Promise.all(
            [
                [this.model, this.config.serve] as const,
                [this.prevModel, this.config.servePrev] as const,
            ].map(async ([model, serve]) => {
                if (serve.type !== "distributed") {
                    return;
                }
                const {data, specs} = await tf.io.encodeWeights(
                    model.model.weights.map(w => ({
                        name: w.name,
                        tensor: w.read(),
                    })),
                );
                await this.games.reloadModel(model.name, data, specs);
            }),
        );
    }

    /** Closes game threads. */
    public async close(): Promise<void> {
        await this.closeProfiles();
        return await this.games.close();
    }

    /** Force-closes game threads. */
    public async terminate(): Promise<void> {
        await this.closeProfiles();
        return await this.games.terminate();
    }

    /** Closes batch predict profiles. */
    private async closeProfiles(): Promise<void> {
        if (this.profile) {
            await this.model.deconfigure("eval");
            this.profile = undefined;
        }
        if (this.prevProfile) {
            await this.prevModel.deconfigure("eval");
            this.prevProfile = undefined;
        }
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
        if (step % this.config.predictMetricsInterval === 0) {
            this.profile?.startMetrics("train", step);
            this.prevProfile?.startMetrics("train", step);
        }

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

        this.profile?.endMetrics();
        this.prevProfile?.endMetrics();
    }

    /** Generates game configs for the thread pool. */
    private *genArgs(step: number): Generator<GamePoolArgs> {
        const opts: Omit<GameArgsGenOptions, "opponent"> = {
            agentConfig: {
                name: "evaluate",
                exploit: {type: "model", model: this.model.name},
            },
            numGames: this.config.numGames,
            ...(this.logPath !== undefined && {
                logPath: join(this.logPath, `step-${step}`),
            }),
            ...(this.config.pool.reduceLogs && {reduceLogs: true}),
            ...(this.seeders && {seeders: this.seeders}),
        };
        const opponents: GameAgentConfig[] = [
            {
                name: "previous",
                exploit: {type: "model", model: this.prevModel.name},
            },
            {name: "random", exploit: {type: "random"}},
            {name: "randmove", exploit: {type: "random", moveOnly: true}},
            {name: "damage", exploit: {type: "random", moveOnly: "damage"}},
        ];
        for (const opponent of opponents) {
            yield* GamePipeline.genArgs({...opts, opponent});
        }
    }
}
