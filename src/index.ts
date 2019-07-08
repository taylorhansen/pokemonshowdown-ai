// istanbul ignore file
import { join } from "path";
import { Network } from "./ai/Network";
import { latestModelFolder, loginServer, password, playServer, username } from
    "./config";
import { Logger } from "./Logger";
import { PSBattle } from "./psbot/PSBattle";
import { PSBot } from "./psbot/PSBot";

(async function()
{
    // create client object
    const bot = new PSBot(Logger.stdout.prefix("PSBot: "));

    // configure client to login once connected
    if (username) bot.login({username, password, loginServer});

    if (!(await bot.connect(playServer))) return;

    // update avatar
    bot.setAvatar(50);

    // load neural network from disk
    const network = await Network.loadNetwork(
        `file://${join(latestModelFolder, "model.json")}`);

    // configure client to accept certain challenges
    bot.acceptChallenges("gen4randombattle",
        (room, user, sender) =>
            new PSBattle(user, network, sender,
                Logger.stdout.prefix(`PSBattle(${room})`)));
})();
