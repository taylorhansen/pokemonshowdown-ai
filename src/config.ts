/** @file Contains config info. */
import { join } from "path";

/** Default path for the neural network models folder. */
export const modelsFolder = join(__dirname, "../models");

/** Default path for the latest neural network model. */
export const modelPath = join(modelsFolder, "latest");

/** Default path for training battle logs */
export const logsFolder = join(__dirname, "../logs");
