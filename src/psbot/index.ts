// istanbul ignore file: demo
import {join} from "path";
import * as tf from "@tensorflow/tfjs";
import {
    avatar,
    latestModelFolder,
    loginServer,
    password,
    playServer,
    username,
    // For some reason the linter doesn't like gitignored source files.
    // eslint-disable-next-line node/no-unpublished-import
} from "../config";
import {importTfn} from "../tfn";
import {Logger} from "../util/logging/Logger";
import {PsBot} from "./PsBot";
import * as handlers from "./handlers";
import {networkAgent} from "./handlers/battle/ai/networkAgent";
// Make sure custom layers can be deserialized.
import "../train/model/custom_layers";

// Select native backend.
importTfn(process.argv[2] === "--gpu" /*use gpu*/);

// Load neural network from disk in the background while connecting.
const modelPromise = tf.loadLayersModel(
    `file://${join(latestModelFolder, "model.json")}`,
);

const logger = Logger.stderr;

void (async function () {
    const bot = new PsBot(logger.addPrefix("PSBot: "));

    try {
        await bot.connect(playServer);
    } catch (e) {
        logger.error(`Connection error: ${(e as Error)?.stack ?? e}`);
        return;
    }

    if (username) {
        await bot.login({username, password, loginServer});
    }
    if (avatar !== null) {
        bot.setAvatar(avatar);
    }

    const model = await modelPromise;
    const agent = networkAgent(model, "deterministic");

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
