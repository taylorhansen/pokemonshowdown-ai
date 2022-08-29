import * as fs from "fs";
import * as stream from "stream";
import {serialize} from "v8";
import {parentPort, workerData} from "worker_threads";
import {rng} from "../../../../util/random";
import {ModelPort} from "../../../model/port";
import {RawPortResultError} from "../../../port/PortProtocol";
import {WorkerClosed} from "../../../port/WorkerProtocol";
import {TrainingExampleEncoder} from "../../../tfrecord/encoder";
import {TrainingExample} from "../../experience/TrainingExample";
import {playGame, SimArgsAgent} from "../../sim/playGame";
import {
    GameMessage,
    GamePlay,
    GamePlayResult,
    GameWorkerData,
} from "./GameProtocol";
import {randomAgent, randomExpAgent} from "./randomAgent";

const gameWorkerData = workerData as GameWorkerData;

if (!parentPort) {
    throw new Error("No parent port!");
}

// Setup input stream.

const inputStream = new stream.Readable({objectMode: true, read() {}});

// Setup game stream.

async function processMessage(msg: GamePlay): Promise<TrainingExample[]> {
    const modelPorts: ModelPort[] = [];

    // Should never throw since playGame wraps any caught errors, but just in
    // case it does, the caller should be able to handle it.
    try {
        const agents = msg.agents.map<SimArgsAgent>(config => {
            switch (config.exploit.type) {
                case "model": {
                    const modelPort = new ModelPort(config.exploit.port);
                    modelPorts.push(modelPort);
                    return {
                        agent: modelPort.getAgent(config.explore),
                        emitExperience: !!config.emitExperience,
                        ...(config.seed && {seed: config.seed}),
                    };
                }
                case "random": {
                    const agentRandom = config.exploit.seed
                        ? rng(config.exploit.seed)
                        : undefined;
                    return config.emitExperience
                        ? ({
                              agent: async (state, choices) =>
                                  await randomExpAgent(
                                      state,
                                      choices,
                                      agentRandom,
                                  ),
                              emitExperience: true,
                              ...(config.seed && {seed: config.seed}),
                          } as SimArgsAgent)
                        : ({
                              agent: async (state, choices) =>
                                  await randomAgent(
                                      state,
                                      choices,
                                      agentRandom,
                                  ),
                              emitExperience: false,
                              ...(config.seed && {seed: config.seed}),
                          } as SimArgsAgent);
                }
                default: {
                    const unsupported: unknown = config.exploit;
                    throw new Error(
                        `Unknown exploit type: ${
                            (unsupported as {type: string}).type
                        }`,
                    );
                }
            }
        }) as [SimArgsAgent, SimArgsAgent];

        // Simulate the game.
        const gameResult = await playGame(
            {
                agents,
                ...(msg.play.maxTurns && {maxTurns: msg.play.maxTurns}),
                ...(msg.play.logPath && {logPath: msg.play.logPath}),
                ...(msg.play.seed && {seed: msg.play.seed}),
            },
            msg.play.experienceConfig,
        );

        // Send the result back to the main thread.
        const result: GamePlayResult = {
            type: "play",
            rid: msg.rid,
            done: true,
            numExamples: gameResult.examples.length,
            winner: gameResult.winner,
            ...(gameResult.err && {err: serialize(gameResult.err)}),
        };
        // Make sure the appropriate data is moved, not copied.
        parentPort!.postMessage(
            result,
            result.err ? [result.err.buffer] : undefined,
        );

        return gameResult.examples;
    } finally {
        // Make sure all ports are closed at the end.
        for (const p of modelPorts) {
            p.close();
        }
    }
}

let lastGamePromise = Promise.resolve();
const gameStream = new stream.Transform({
    objectMode: true,
    highWaterMark: 1,
    transform(
        msg: GamePlay,
        encoding: BufferEncoding,
        callback: stream.TransformCallback,
    ): void {
        // Use promises to force sequential.
        const p = lastGamePromise;
        lastGamePromise = (async () => {
            await p;
            let examples: TrainingExample[];
            try {
                examples = await processMessage(msg);
            } catch (e) {
                // Transport error object to main thread for logging.
                const result: RawPortResultError = {
                    type: "error",
                    rid: msg.rid,
                    done: true,
                    err: serialize(e),
                };
                parentPort!.postMessage(result, [result.err.buffer]);
                examples = [];
            }
            if (msg.play.expPath) {
                this.push({examples, path: msg.play.expPath});
            }
            callback();
        })();
    },
});

// Setup experience stream for when game is configured for it.

const expStream = new stream.Writable({
    objectMode: true,
    highWaterMark: gameWorkerData.highWaterMark ?? 4,
    write(
        data: {examples: TrainingExample[]; path: string},
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        if (data.examples.length <= 0) {
            callback();
            return;
        }
        stream.promises
            .pipeline(
                data.examples,
                new TrainingExampleEncoder(),
                fs.createWriteStream(data.path, {
                    encoding: "binary",
                    flags: "w",
                }),
            )
            .then(() => callback())
            .catch(callback);
    },
});

// Setup pipeline.
// Any errors that escape from the pipeline are propagated through the worker.
// Generally the AsyncPort that wraps this Worker should be able to handle any
// unresolved requests.
let pipelinePromise = stream.promises.pipeline(
    inputStream,
    gameStream,
    expStream,
);

parentPort.on("message", function handleMessage(msg: GameMessage) {
    switch (msg.type) {
        case "play":
            // Note: Due to stream backpressure, this may not be immediately
            // processed.
            inputStream.push(msg);
            break;
        case "close":
            pipelinePromise = pipelinePromise.finally(() => {
                // Indicate done.
                const response: WorkerClosed = {
                    type: "close",
                    rid: msg.rid,
                    done: true,
                };
                parentPort!.postMessage(response);
            });
            // Signal end of stream.
            inputStream.push(null);
            break;
    }
});
