import * as fs from "fs";
import * as stream from "stream";
import * as util from "util";
import { serialize } from "v8";
import { parentPort, workerData } from "worker_threads";
import { AExpToTFRecord } from "../../helpers/AExpToTFRecord";
import { WorkerClosed } from "../../helpers/workers/WorkerRequest";
import { AugmentedExperience } from "../../nn/learn/AugmentedExperience";
import { RawPortResultError } from "../../nn/worker/helpers/AsyncPort";
import { ModelPort } from "../../nn/worker/ModelPort";
import { SimArgsAgent } from "../../sim/simulators";
import { GameWorkerMessage, GameWorkerPlay, GameWorkerPlayResult } from
    "./GameWorkerRequest";
import { playGame } from "./playGame";

if (!parentPort) throw new Error("No parent port!");

// setup input stream

const inputStream = new stream.Readable({objectMode: true, read() {}});

// setup game stream

async function processMessage(msg: GameWorkerPlay):
    Promise<AugmentedExperience[]>
{
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


        const result: GameWorkerPlayResult =
        {
            type: "play", rid: msg.rid, done: true,
            numAExps: gameResult.experiences.length,
            winner: gameResult.winner,
            ...(gameResult.err && {err: serialize(gameResult.err)})
        };

        // send the result back to the main thread
        // make sure the appropriate data is moved, not copied
        parentPort!.postMessage(result,
            result.err ? [result.err.buffer] : undefined);

        return gameResult.experiences;
    }
    catch (err) { throw err; } // rethrow to stream handler for logging
    // make sure all ports are closed at the end
    finally { await Promise.all(modelPorts.map(p => p.close())); }
}

let lastGamePromise = Promise.resolve();
const gameStream = new stream.Transform(
{
    objectMode: true, readableHighWaterMark: 128,
    transform(msg: GameWorkerPlay, encoding: BufferEncoding,
        callback: stream.TransformCallback): void
    {
        // use promises to force sequential
        lastGamePromise = lastGamePromise
            .then(() => processMessage(msg))
            .catch(err =>
            {
                // transport error object to main thread for logging
                const errBuf = serialize(err);
                const result: RawPortResultError =
                    {type: "error", rid: msg.rid, done: true, err: errBuf};
                parentPort!.postMessage(result, [errBuf.buffer]);
                return [];
            })
            .then(aexps =>
            {
                for (const aexp of aexps) this.push(aexp);
                callback();
            });
    }
});

// setup experience stream if configured for it

let expStream: [stream.Transform, stream.Writable] | [] = [];
if (workerData.expPath)
{
    expStream =
    [
        new AExpToTFRecord(),
        // use append option to keep from overwriting any previous tfrecords
        // TODO: if an errored worker gets replaced, what guarantees that the
        //  tfrecord file is still valid?
        fs.createWriteStream(workerData.expPath,
            {encoding: "binary", flags: "a"})
    ];
}

// setup pipeline

let pipelinePromise = util.promisify(stream.pipeline)(
    inputStream, gameStream, ...expStream);

parentPort.on("message", function handleMessage(msg: GameWorkerMessage)
{
    if (msg.type === "play") inputStream.push(msg);
    else if (msg.type === "close")
    {
        inputStream.push(null);
        pipelinePromise = pipelinePromise.then(function onPipelineDone()
        {
            const response: WorkerClosed =
                {type: "close", rid: msg.rid, done: true}
            parentPort?.postMessage(response);
        });
    }
});
