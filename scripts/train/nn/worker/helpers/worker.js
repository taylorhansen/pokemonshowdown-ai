/** @file Substitute for `worker.ts` while executing via `ts-node`. */
const { resolve } = require("path");
require("ts-node").register();
require(resolve(__dirname, "./worker.ts"));
