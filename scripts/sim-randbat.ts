/** @file Simulates a random battle used for training. */
import {randomAgent} from "../src/ts/battle/agent/random";
import {gen4Parser} from "../src/ts/battle/parser/gen4";
import {ExperienceBattleParser} from "../src/ts/battle/worker/ExperienceBattleParser";
import {PlayerOptions, simulateBattle} from "../src/ts/battle/worker/battle";
import {wrapTimeout} from "../src/ts/utils/timeout";
import {Mutable} from "../src/ts/utils/types";

Error.stackTraceLimit = Infinity;

const timeoutMs = 5000; // 5s
const battleTimeoutMs = 1000; // 1s
const maxTurns = 50;
const p1Exp = true;
const p2Exp = true;

void (async function () {
    const p1: Mutable<PlayerOptions> = {
        name: "p1",
        agent: randomAgent,
        parser: gen4Parser,
    };
    const p2: Mutable<PlayerOptions> = {
        name: "p2",
        agent: randomAgent,
        parser: gen4Parser,
    };
    if (p1Exp) {
        const expParser = new ExperienceBattleParser(p1.parser, "p1");
        p1.parser = async (ctx, event) => await expParser.parse(ctx, event);
        p1.agent = async (state, choices) => await randomAgent(state, choices);
    }
    if (p2Exp) {
        const expParser = new ExperienceBattleParser(p2.parser, "p2");
        p2.parser = async (ctx, event) => await expParser.parse(ctx, event);
        p2.agent = async (state, choices) => await randomAgent(state, choices);
    }

    const result = await wrapTimeout(
        async () =>
            await simulateBattle({
                players: {p1, p2},
                maxTurns,
                timeoutMs: battleTimeoutMs,
            }),
        timeoutMs,
    );
    console.log(`winner: ${result.winner}`);
    console.log(`truncated: ${!!result.truncated}`);
    console.log(`log path: ${result.logPath}`);
    console.log(`err: ${result.err?.stack ?? result.err}`);
})().catch(err => console.log("sim-randbat failed:", err));
