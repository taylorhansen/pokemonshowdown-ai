/**
 * @file Compares specified models by having them play against each other in
 * round-robin format.
 */
import {join} from "path";
import ProgressBar from "progress";
import {config} from "../config";
import {
    GameArgsGenOptions,
    GameArgsGenSeeders,
    GamePipeline,
} from "../train/game/pool";
import {ModelWorker} from "../train/model/worker";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {ensureDir} from "../util/paths/ensureDir";
import {pathToFileUrl} from "../util/paths/pathToFileUrl";
import {seeder} from "../util/random";

void (async function () {
    const compareModels = [...new Set(config.compare.models)];

    const logger = new Logger(
        Logger.stderr,
        config.train.verbose ?? Verbose.Debug,
        `Compare: `,
    );
    logger.info(`Comparing models: ${compareModels.join(", ")}`);
    if (compareModels.length < 2) {
        logger.error(
            `Must have at least two models: got ${compareModels.length}`,
        );
        return;
    }

    const logPath = join(config.paths.logs, "compare", config.compare.name);
    const metricsPath = join(
        config.paths.metrics,
        "compare",
        config.compare.name,
    );
    await Promise.all([logPath, metricsPath].map(ensureDir));

    const models = new ModelWorker(config.tf.gpu, metricsPath);
    try {
        for (const model of compareModels) {
            if (model === "random") {
                continue;
            }

            logger.debug("Loading model: " + model);
            try {
                await models.load(
                    model,
                    config.compare.batchPredict,
                    pathToFileUrl(
                        join(config.paths.models, model, "model.json"),
                    ),
                );
            } catch (e) {
                logger.error(`Error loading model: ${e}`);
                return;
            }
        }

        const numMatchups =
            (compareModels.length * (compareModels.length - 1)) / 2;
        const totalGames = numMatchups * config.compare.numGames;
        const gamesPadding = Math.max(1, Math.ceil(Math.log10(totalGames)));
        const progressBar = new ProgressBar(
            logger.prefix + "Games :games/:total :bar",
            {
                total: totalGames,
                head: ">",
                clear: true,
                width:
                    (process.stderr.columns || 80) -
                    "Games / ".length -
                    2 * gamesPadding,
            },
        );
        progressBar.render({games: "0".padStart(gamesPadding)});
        const progressLogger = logger.withFunc(msg =>
            progressBar.complete
                ? Logger.stderr(msg)
                : progressBar.interrupt(
                      // Account for extra newline inserted by interrupt.
                      msg.endsWith("\n") ? msg.slice(0, -1) : msg,
                  ),
        );

        const wlt: {
            [model: string]: {
                [vs: string]: {
                    win: number;
                    loss: number;
                    tie: number;
                    total: number;
                };
            };
        } = {};

        const wins: {readonly [model: string]: string[]} = Object.fromEntries(
            compareModels.map(model => [model, []]),
        );

        const seeders: GameArgsGenSeeders | undefined = config.compare
            .seeds && {
            ...(config.compare.seeds.battle && {
                battle: seeder(config.compare.seeds.battle),
            }),
            ...(config.compare.seeds.team && {
                team: seeder(config.compare.seeds.team),
            }),
            ...(config.compare.seeds.explore && {
                explore: seeder(config.compare.seeds.explore),
            }),
        };

        const genArgs = function* () {
            for (let i = 0; i < compareModels.length - 1; ++i) {
                const model = compareModels[i];
                const opts: Omit<GameArgsGenOptions, "opponent"> = {
                    agentConfig: {
                        name: model,
                        // Note: Random seeds filled in by playGames().
                        exploit:
                            model === "random"
                                ? {type: "random"}
                                : {type: "model", model},
                    },
                    requestModelPort: async modelName =>
                        await models.subscribe(modelName),
                    numGames: config.compare.numGames,
                    logPath: join(logPath, model),
                    ...(config.compare.pool.reduceLogs && {reduceLogs: true}),
                    ...(seeders && {seeders}),
                };
                for (let j = i + 1; j < compareModels.length; ++j) {
                    const opp = compareModels[j];
                    yield* GamePipeline.genArgs({
                        ...opts,
                        opponent: {
                            name: opp,
                            // Note: Random seeds filled in by provided seeders.
                            exploit:
                                opp === "random"
                                    ? {type: "random"}
                                    : {type: "model", model: opp},
                        },
                    });
                }
            }
        };

        const games = new GamePipeline(config.compare.pool);
        try {
            await games.run(genArgs(), result => {
                progressBar.tick({
                    games: String(progressBar.curr + 1).padStart(gamesPadding),
                });

                const gameLogger = progressLogger.addPrefix(
                    `Games(${result.agents[0]} vs ${result.agents[1]}): `,
                );
                if (result.err) {
                    gameLogger.error(
                        `Game ${result.id} threw an error: ` +
                            `${result.err.stack ?? result.err.toString()}`,
                    );
                }

                const modelWlt = (wlt[result.agents[0]] ??= {});
                const vsWlt = (modelWlt[result.agents[1]] ??= {
                    win: 0,
                    loss: 0,
                    tie: 0,
                    total: 0,
                });
                if (result.winner === 0) {
                    ++vsWlt.win;
                } else if (result.winner === 1) {
                    ++vsWlt.loss;
                } else {
                    ++vsWlt.tie;
                }
                ++vsWlt.total;

                if (vsWlt.total >= config.compare.numGames) {
                    if (vsWlt.win / vsWlt.total > config.compare.threshold) {
                        wins[result.agents[0]].push(result.agents[1]);
                    }
                    if (vsWlt.loss / vsWlt.total > config.compare.threshold) {
                        wins[result.agents[1]].push(result.agents[0]);
                    }
                    gameLogger.info(
                        `Record: ${vsWlt.win}-${vsWlt.loss}-${vsWlt.tie}`,
                    );
                }
            });
        } finally {
            await games.cleanup();
            progressBar.terminate();
        }

        logger.info(
            `Results:\n - ${compareModels
                .map(model => `${model}: ${wins[model].join(", ")}`)
                .join("\n - ")}`,
        );
    } catch (e) {
        logger.error((e as Error).stack ?? (e as Error).toString());
    } finally {
        await models.close();
        logger.info("Done");
    }
})();
