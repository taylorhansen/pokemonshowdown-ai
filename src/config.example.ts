/** @file Contains config info. */
import { join } from "path";

// neural network files

/** Default path for the neural network models folder. */
export const modelsFolder = join(__dirname, "../models");
/** Default path for the latest neural network model folder. */
export const latestModelPath = join(modelsFolder, "latest");

// sim logs from training

/** Default path for training battle logs */
export const logsFolder = join(__dirname, "../logs");
/** Default path for self-play logs. */
export const selfPlayFolder = join(logsFolder, "self-play");
/** Default path for evaluation logs. */
export const evaluateFolder = join(logsFolder, "evaluate");

// login info

/** Account username. */
export const username = "username";
/** Account password. Optional. */
export const password = "password";
/** Domain to login with. */
export const domain = "https://play.pokemonshowdown.com";
/** Server id used for login. */
export const serverid = "showdown";
/** Account avatar id. */
export const avatar = 1;
