// istanbul ignore file
import { join } from "path";
import { Network } from "./ai/Network";
import { latestModelFolder, loginServer, password, playServer, username } from
    "./config";
import { Logger } from "./Logger";
import { PSBot } from "./psbot/PSBot";

// create client object
const bot = new PSBot(Logger.stdout.prefix("PSBot: "));

// configure client to accept certain challenges
// here the neural network has to be loaded from disk first
Network.loadNetwork(`file://${join(latestModelFolder, "model.json")}`)
    .then(net => bot.acceptChallenges("gen4randombattle", net));

// configure client to login once connected
if (username) bot.login({username, password, loginServer});

// connect to locally hosted PokemonShowdown server
bot.connect(playServer).then(connected =>
{
    if (!connected) return;

    // update avatar
    bot.setAvatar(50);
});
