/* istanbul ignore file */
import { DefaultNetwork } from "./ai/DefaultNetwork";
import { PSBot } from "./bot/PSBot";
import { Logger } from "./Logger";

// create client object
const bot = new PSBot(Logger.stdout.prefix("PSBot: "));

// configure client to accept certain challenges
bot.acceptChallenges("gen4randombattle", DefaultNetwork);

// connect to locally hosted PokemonShowdown server
bot.connect("ws://localhost:8000/showdown/websocket");
