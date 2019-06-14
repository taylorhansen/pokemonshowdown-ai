// istanbul ignore file
/** @file Contains config info. */
import { join } from "path";

// neural network files

/** Default path for the neural network models folder. */
export const modelsFolder = join(__dirname, "../models/");
/** Default path for the latest neural network model folder. */
export const latestModelFolder = join(modelsFolder, "latest/");

// sim logs from training

/** Default path for training battle logs. */
export const logsFolder = join(__dirname, "../logs/");
/** Default path for self-play logs. */
export const selfPlayFolder = join(logsFolder, "self-play/");
/** Default path for evaluation logs. */
export const evaluateFolder = join(logsFolder, "evaluate/");

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
/** Server id used for login. */
export const serverid = "showdown";
/** Account avatar id. */
export const avatar = 1;
