// istanbul ignore file: Demo.
import * as path from "path";
import * as tf from "@tensorflow/tfjs";
import {config} from "../config";
import {PsBot} from "../psbot/PsBot";
import * as handlers from "../psbot/handlers";
import {networkAgent} from "../psbot/handlers/battle/ai/networkAgent";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {pathToFileUrl} from "../util/paths/pathToFileUrl";
import {importTfn} from "../util/tfn";
// Make sure custom layers can be deserialized.
import "../train/model/custom_layers";

// Select native backend.
importTfn(config.tf.gpu);

// Load neural network from disk in the background while connecting.
const modelPromise = tf.loadLayersModel(
    pathToFileUrl(path.join(config.paths.models, "latest/model.json")),
);

const logger = new Logger(Logger.stderr, config.psbot.verbose ?? Verbose.Debug);

void (async function () {
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

    const model = await modelPromise;
    const agent = networkAgent(
        model,
        undefined /*callback*/,
        true /*debugRankings*/,
    );

    bot.acceptChallenges(
        "gen4randombattle",
        (room, user, sender) =>
            new handlers.battle.BattleHandler({
                username: user,
                agent,
                sender,
                logger: logger.addPrefix(`BattleHandler(${room}): `),
            }),
    );
})();
