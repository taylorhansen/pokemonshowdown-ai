// istanbul ignore file
import * as tf from "@tensorflow/tfjs-node";
import { join } from "path";
import { networkAgent } from "./ai/networkAgent";
import { avatar, latestModelFolder, loginServer, password, playServer,
    username } from "./config";
import { Logger } from "./Logger";
import { PSBattle } from "./psbot/PSBattle";
import { PSBot } from "./psbot/PSBot";

(async function()
{
    // create client object
    const bot = new PSBot(Logger.stdout.addPrefix("PSBot: "));

    // configure client to login once connected
    if (username) bot.login({username, password, loginServer});

    try { await bot.connect(playServer); }
    catch (e) { console.log("connection error: " + e); }

    // update avatar
    if (avatar !== null) bot.setAvatar(avatar);

    // load neural network from disk
    const model = await tf.loadLayersModel(
        `file://${join(latestModelFolder, "model.json")}`);
    const agent = networkAgent(model, "deterministic");

    // configure client to accept certain challenges
    bot.acceptChallenges("gen4randombattle",
        (room, user, sender) =>
            new PSBattle(user, agent, sender,
                Logger.stdout.addPrefix(`PSBattle(${room}): `)));
})();
