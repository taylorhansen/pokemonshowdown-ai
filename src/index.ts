// istanbul ignore file
import { join } from "path";
import { NetworkAgent } from "./ai/NetworkAgent";
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
    const network = await NetworkAgent.loadNetwork(
        `file://${join(latestModelFolder, "model.json")}`, "deterministic");

    // configure client to accept certain challenges
    bot.acceptChallenges("gen4randombattle",
        (room, user, sender) =>
            new PSBattle(user, network, sender,
                Logger.stdout.addPrefix(`PSBattle(${room})`)));
})();
