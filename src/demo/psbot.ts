// istanbul ignore file: Demo.
import {join} from "path";
import {config} from "../config";
import {ModelPort} from "../model/port";
import {ModelWorker} from "../model/worker";
import {PsBot} from "../psbot/PsBot";
import * as handlers from "../psbot/handlers";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {pathToFileUrl} from "../util/paths/pathToFileUrl";

void (async function () {
    const logger = new Logger(
        Logger.stderr,
        config.psbot.verbose ?? Verbose.Debug,
    );

    const bot = new PsBot(logger.addPrefix("PsBot: "));

    try {
        await bot.connect(config.psbot.websocketRoute);
    } catch (e) {
        logger.error(`Connection error: ${(e as Error)?.stack ?? e}`);
        return;
    }

    if (config.psbot.username) {
        await bot.login({
            username: config.psbot.username,
            ...(config.psbot.password && {password: config.psbot.password}),
            loginUrl: config.psbot.loginUrl,
        });
    }
    if (config.psbot.avatar) {
        bot.setAvatar(config.psbot.avatar);
    }

    const models = new ModelWorker("psbot", config.tf.gpu);
    const model = await models.load(
        "model",
        config.psbot.batchPredict,
        pathToFileUrl(
            join(config.paths.models, config.psbot.model, "model.json"),
        ),
    );

    bot.acceptChallenges("gen4randombattle", async (room, user, sender) => {
        const port = new ModelPort(await models.subscribe(model));
        const handler = new handlers.battle.BattleHandler({
            username: user,
            agent: port.getAgent(undefined /*explore*/, true /*debugRankings*/),
            sender,
            logger: logger.addPrefix(`BattleHandler(${room}): `),
        });
        // Make sure ports aren't dangling.
        void handler
            .finish()
            .catch(() => {})
            .finally(() => port.close());
        return handler;
    });
})();
