// istanbul ignore file
/** @file Contains config info. */
import { join } from "path";

// neural network files

/** Default path for the neural network models folder. */
export const modelsFolder = join(__dirname, "../models/");
/** Default path for the latest neural network model folder. */
export const latestModelFolder = join(modelsFolder, "latest/");

// sim logs from training

/** Path to the folder to store training battle logs in. */
export const logPath = join(__dirname, "../logs/");

// login info

/** Account username. Set to the empty string to use a default guest account. */
export const username = "";
/** Account password. Set to the empty string to login without a password. */
export const password = "";
/** Path to the `action.php` used to login to an account. */
export const loginServer =
    "https://play.pokemonshowdown.com/~~showdown/action.php";
/**
 * Websocket route used for actual server play. To connect to the official
 * server, use `ws://sim.smogon.com:8000/...` or `wss://sim.smogon.com/...`
 */
export const playServer = "ws://localhost:8000/showdown/websocket";
/** Account avatar id. Set to null to not set it on login. */
export const avatar = 1;
