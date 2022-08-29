/**
 * @file Compares specified models by having them play against each other in
 * round-robin format.
 */
import * as path from "path";
import {pathToFileURL} from "url";
import {config} from "../config";
import {ModelWorker} from "../train/model/worker";
import {Opponent, playGames, PlayGamesSeeders} from "../train/play";
import {GamePool} from "../train/play/pool";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {seeder} from "../util/random";

void (async function () {
    // Dedup.
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

    const name = compareModels.join("-");

    const models = new ModelWorker(
        config.tf.gpu,
        path.join(config.paths.logs, `tensorboard/compare/${name}`),
    );
    await models.log("start", 0, {});
    for (const model of compareModels) {
        if (model === "random") {
            continue;
        }

        logger.debug("Loading model: " + model);
        try {
            await models.load(
                model,
                config.compare.batchPredict,
                pathToFileURL(
                    path.join(config.paths.models, model, "model.json"),
                ).href,
            );
        } catch (e) {
            logger.error(`Error loading model: ${e}`);
            return;
        }
    }

    const games = new GamePool(config.compare.numThreads);

    const wins: {readonly [model: string]: string[]} = Object.fromEntries(
        compareModels.map(model => [model, []]),
    );

    const seeders: PlayGamesSeeders | undefined = config.compare.seeds && {
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

    try {
        for (let i = 0; i < compareModels.length - 1; ++i) {
            const model = compareModels[i];

            const opponents = compareModels.slice(i + 1).map<Opponent>(opp => ({
                name: opp,
                agentConfig: {
                    // Note: Random seeds filled in by playGames().
                    exploit:
                        opp === "random"
                            ? {type: "random"}
                            : {type: "model", model: opp},
                },
                numGames: config.compare.numGames,
            }));

            const results = await playGames({
                name: "compare",
                step: 0,
                stage: model,
                models,
                games,
                agentConfig: {
                    // Note: Random seeds filled in by playGames().
                    exploit:
                        model === "random"
                            ? {type: "random"}
                            : {type: "model", model},
                },
                opponents,
                maxTurns: config.compare.maxTurns,
                logger: logger.addPrefix(`${model}: `),
                logPath: path.join(config.paths.logs, "compare", model),
                seeders,
                progress: true,
            });

            for (const result of results.opponents) {
                const total = result.wins + result.losses + result.ties;
                if (result.wins / total > config.compare.threshold) {
                    wins[model].push(result.name);
                }
                if (result.losses / total > config.compare.threshold) {
                    wins[result.name].push(model);
                }
            }
        }

        logger.info(
            `Results:\n - ${compareModels
                .map(model => `${model}: ${wins[model].join(", ")}`)
                .join("\n - ")}`,
        );
    } catch (e) {
        logger.error(
            "Comparison script threw an error: " +
                ((e as Error).stack ?? (e as Error).toString()),
        );
    } finally {
        await games.close();
        await models.close();
        logger.info("Done");
    }
})();
