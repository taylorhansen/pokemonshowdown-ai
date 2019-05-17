/* istanbul ignore file */
import { Network } from "./ai/Network";
import { domain, latestModelPath, password, serverid, username } from
    "./config";
import { Logger } from "./Logger";
import { PSBot } from "./psbot/PSBot";

// create client object
const bot = new PSBot(Logger.stdout.prefix("PSBot: "));

// configure client to accept certain challenges
// here the neural network has to be loaded from disk first
Network.loadNetwork(`file://${latestModelPath}/model.json`)
    .then(net => bot.acceptChallenges("gen4randombattle", net));

// configure client to login once connected
bot.login({username, password, domain, serverid});

// connect to locally hosted PokemonShowdown server
bot.connect("ws://localhost:8000/showdown/websocket").then(connected =>
{
    if (!connected) return;

    // update avatar
    bot.setAvatar(50);
});
