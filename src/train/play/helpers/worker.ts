import { serialize } from "v8";
import { parentPort } from "worker_threads";
import { WorkerClosed } from "../../helpers/workers/WorkerRequest";
import { RawPortResultError } from "../../nn/worker/helpers/AsyncPort";
import { ModelPort } from "../../nn/worker/ModelPort";
import { SimArgsAgent } from "../../sim/simulators";
import { GameWorkerMessage, GameWorkerPlayResult } from "./GameWorkerRequest";
import { playGame } from "./playGame";

if (!parentPort) throw new Error("No parent port!");

let lastPromise: Promise<void> = Promise.resolve();

parentPort.on("message", (msg: GameWorkerMessage) =>
    // force message processing to be sequential so we don't get overloaded
    lastPromise = lastPromise
        .then(() => processMessage(msg)
            .catch(err =>
            {
                // transport error object to main thread for logging
                const errBuf = serialize(err);
                const result: RawPortResultError =
                    {type: "error", rid: msg.rid, done: true, err: errBuf};
                parentPort!.postMessage(result, [errBuf.buffer]);
            })));

async function processMessage(msg: GameWorkerMessage): Promise<void>
{
    if (msg.type === "close")
    {
        const result: WorkerClosed = {type: "close", rid: msg.rid, done: true};
        parentPort!.postMessage(result);
        return;
    }

    const modelPorts: [ModelPort, ModelPort] = [] as any;

    try
    {
        const agents: [SimArgsAgent, SimArgsAgent] = [] as any;
        for (const config of msg.agents)
        {
            const modelPort = new ModelPort(config.port);
            modelPorts.push(modelPort);
            agents.push(
                {agent: modelPort.getAgent("stochastic"), exp: config.exp});
        }

        // simulate the game
        const gameResult = await playGame(msg.simName,
            {agents, maxTurns: msg.maxTurns, logPath: msg.logPath},
            msg.rollout);

        const transferList: ArrayBuffer[] = [];

        const result: GameWorkerPlayResult =
        {
            type: "play", rid: msg.rid, done: true,
            experiences: gameResult.experiences, winner: gameResult.winner,
            ...(gameResult.err && {err: serialize(gameResult.err)})
        };
        if (result.err) transferList.push(result.err.buffer);

        // make sure the data in each AugmentedExperience is moved, not copied
        for (const aexp of gameResult.experiences)
        {
            transferList.push(aexp.state.buffer, aexp.logProbs.buffer);
        }

        // send the result back to the main thread
        parentPort!.postMessage(result, transferList);
    }
    catch (err) { throw err; } // rethrow to global catch handler
    // make sure all ports are closed at the end
    finally { await Promise.all(modelPorts.map(p => p.close())); }
}
