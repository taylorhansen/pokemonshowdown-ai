/**
 * @file Reroutes to `worker.ts` when executing via `ts-node`. This file
 * shouldn't be compiled or included in the actual build.
 */
const { resolve } = require("path");
require("ts-node").register();
require(resolve(__dirname, "./worker.ts"));
