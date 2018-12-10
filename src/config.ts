/** @file Contains config info. */
import { join } from "path";

/** Default path to use for the neural network models folder. */
export const modelsFolder = join(__dirname, "../models");

/** Default path to use for the latest neural network model. */
export const modelPath = join(modelsFolder, "latest");
