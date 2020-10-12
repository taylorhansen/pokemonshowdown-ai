import { baseEventLoop } from "../helpers";
import { dispatch } from "./base";

/** Main entry point for the gen4 parser. */
export const main = baseEventLoop(dispatch);
