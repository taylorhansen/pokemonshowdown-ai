/* istanbul ignore file */
import { DefaultNetwork } from "./ai/Network";
import { PSBot } from "./bot/PSBot";

// create client object
const bot = new PSBot();

// configure client to accept certain challenges
bot.acceptChallenges("gen4randombattle", DefaultNetwork);

// connect to locally hosted PokemonShowdown server
bot.connect("ws://localhost:8000/showdown/websocket");
