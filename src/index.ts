/* istanbul ignore file */
import { DefaultNetwork } from "./ai/DefaultNetwork";
import { PSBot } from "./bot/PSBot";
import { domain, password, serverid, username } from "./config";
import { Logger } from "./Logger";

// create client object
const bot = new PSBot(Logger.stdout.prefix("PSBot: "));

// configure client to accept certain challenges
bot.acceptChallenges("gen4randombattle", DefaultNetwork);

// configure client to login once connected
bot.login({username, password, domain, serverid});

// connect to locally hosted PokemonShowdown server
bot.connect("ws://localhost:8000/showdown/websocket").then(connected =>
{
    if (!connected) return;

    // update avatar
    bot.setAvatar(50);
});
