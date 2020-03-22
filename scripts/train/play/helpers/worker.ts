import { serialize } from "v8";
import { parentPort } from "worker_threads";
import { playGame } from "./playGame";
import { GameWorkerMessage, GameWorkerResult } from "./GameWorkerRequest";
import { ModelPort } from "../../nn/worker/ModelPort";
import { SimArgsAgent } from "../../sim/simulators";
import { PortResultError } from "../../nn/worker/helpers/AsyncPort";

if (!parentPort) throw new Error("No parent port!");

parentPort.on("message", function(msg: GameWorkerMessage)
{
    const modelPorts: [ModelPort, ModelPort] = [] as any;
    const agents: [SimArgsAgent, SimArgsAgent] = [] as any;
    for (const config of msg.agents)
    {
        const modelPort = new ModelPort(config.port);
        modelPorts.push(modelPort);
        agents.push({agent: modelPort.getAgent("stochastic"), exp: config.exp});
    }

    (async function()
    {
        // simulate the game
        const gameResult = await playGame(msg.simName,
            {agents, maxTurns: msg.maxTurns, logPath: msg.logPath},
            msg.rollout);

        for (const modelPort of modelPorts) modelPort.close();

        const result: GameWorkerResult =
            {type: "game", rid: msg.rid, done: true, ...gameResult}

        // make sure the data in each AugmentedExperience is moved, not copied
        const transferList: ArrayBuffer[] = [];
        for (const aexp of gameResult.experiences)
        {
            transferList.push(aexp.state.buffer, aexp.logProbs.buffer);
        }

        // send the result back to the main thread
        parentPort!.postMessage(result, transferList);
    })()
    .catch((err: Error) =>
    {
        const errBuf = serialize(err);
        const result: PortResultError =
            {type: "error", rid: msg.rid, done: true, errBuf};
        parentPort!.postMessage(result, [errBuf.buffer]);
    });
});
