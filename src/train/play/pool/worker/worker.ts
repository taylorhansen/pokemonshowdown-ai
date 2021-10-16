import * as fs from "fs";
import * as stream from "stream";
import { serialize } from "v8";
import { parentPort, workerData } from "worker_threads";
import { ModelPort } from "../../../model/worker";
import { RawPortResultError } from "../../../port/PortProtocol";
import { WorkerClosed } from "../../../port/WorkerProtocol";
import { AExpEncoder } from "../../../tfrecord/encoder";
import { AugmentedExperience } from "../../experience/AugmentedExperience";
import { playGame, SimArgsAgent } from "../../sim/playGame";
import { GameWorkerMessage, GameWorkerPlay, GameWorkerPlayResult } from
    "./GameProtocol";

if (!parentPort) throw new Error("No parent port!");

// setup input stream

const inputStream = new stream.Readable({objectMode: true, read() {}});

// setup game stream

async function processMessage(msg: GameWorkerPlay):
    Promise<AugmentedExperience[]>
{
    const modelPorts: [ModelPort, ModelPort] = [] as any;

    // should never throw since playGame wraps any caught errors, but just in
    //  case it does, the caller should be able to handle it
    try
    {
        const agents: [SimArgsAgent, SimArgsAgent] = [] as any;
        for (const config of msg.agents)
        {
            const modelPort = new ModelPort(config.port, msg.format);
            modelPorts.push(modelPort);
            agents.push(
                {agent: modelPort.getAgent("stochastic"), exp: config.exp});
        }

        // simulate the game
        const gameResult = await playGame(msg.format,
            {agents, maxTurns: msg.maxTurns, logPath: msg.logPath},
            msg.rollout);

        // send the result back to the main thread
        const result: GameWorkerPlayResult =
        {
            type: "play", rid: msg.rid, done: true,
            numAExps: gameResult.experiences.length,
            winner: gameResult.winner,
            ...gameResult.err && {err: serialize(gameResult.err)}
        };
        // make sure the appropriate data is moved, not copied
        parentPort!.postMessage(result,
            result.err ? [result.err.buffer] : undefined);

        return gameResult.experiences;
    }
    // make sure all ports are closed at the end
    finally { await Promise.all(modelPorts.map(p => p.close())); }
}

let lastGamePromise = Promise.resolve();
const gameStream = new stream.Transform(
{
    objectMode: true, readableHighWaterMark: 64,
    transform(msg: GameWorkerPlay, encoding: BufferEncoding,
        callback: stream.TransformCallback): void
    {
        // use promises to force sequential
        const p = lastGamePromise;
        lastGamePromise = (async () =>
        {
            await p;
            let aexps: AugmentedExperience[];
            try { aexps = await processMessage(msg); }
            catch (e: any)
            {
                // transport error object to main thread for logging
                const result: RawPortResultError =
                {
                    type: "error", rid: msg.rid, done: true, err: serialize(e)
                };
                parentPort!.postMessage(result, [result.err.buffer]);
                aexps = [];
            }
            for (const aexp of aexps) this.push(aexp);
            callback();
        })();
    }
});

// setup experience stream if configured for it

let expStream: [stream.Transform, stream.Writable] | [] = [];
if (workerData?.expPath)
{
    expStream =
    [
        new AExpEncoder(),
        // use append option to keep from overwriting any previous tfrecords
        // TODO: if an errored worker gets replaced, what can guarantee that the
        //  tfrecord file is still valid?
        fs.createWriteStream(workerData.expPath,
            {encoding: "binary", flags: "a"})
    ];
}

// setup pipeline
// any errors that escape from the pipeline are propagated through the worker
// generally the AsyncPort that wraps this Worker should be able to handle any
//  unresolved requests
let pipelinePromise = stream.promises.pipeline(
    inputStream, gameStream, ...expStream);

parentPort.on("message", function handleMessage(msg: GameWorkerMessage)
{
    switch (msg.type)
    {
        case "play":
            inputStream.push(msg);
            break;
        case "close":
            pipelinePromise = pipelinePromise.finally(() =>
            {
                // indicate done
                const response: WorkerClosed =
                    {type: "close", rid: msg.rid, done: true};
                parentPort!.postMessage(response);
            });
            // signal end of stream
            inputStream.push(null);
            break;
    }
});
