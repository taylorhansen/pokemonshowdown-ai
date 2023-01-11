import * as stream from "stream";
import {serialize} from "v8";
import {parentPort, TransferListItem, workerData} from "worker_threads";
import {rng} from "../../../../util/random";
import {ModelPort} from "../../../model/port";
import {RawPortResultError} from "../../../port/PortProtocol";
import {WorkerClosed} from "../../../port/WorkerProtocol";
import {randomAgent, randomExpAgent} from "../../agent/random";
import {playGame, SimArgsAgent} from "../../sim/playGame";
import {
    GameMessage,
    GamePlay,
    GamePlayResult,
    GameWorkerData,
} from "./GameProtocol";

const gameWorkerData = workerData as GameWorkerData;

if (!parentPort) {
    throw new Error("No parent port!");
}

// Stream mostly used for buffering capability.
// Note: Any errors in handling specific requests get wrapped and sent to the
// calling thread. If something very bad happens, the AsyncPort/WorkerPort that
// wraps this Worker should be able to handle the crash and take care of any
// unresolved requests.
const gameStream = new stream.Writable({
    objectMode: true,
    async write(
        msg: GamePlay,
        encoding: BufferEncoding,
        callback: (error?: Error | null | undefined) => void,
    ): Promise<void> {
        let result: GamePlayResult | RawPortResultError;
        const transferList: TransferListItem[] = [];
        const modelPorts: ModelPort[] = [];
        try {
            const agents = msg.agents.map<SimArgsAgent>(config => {
                switch (config.exploit.type) {
                    case "model": {
                        const modelPort = new ModelPort(config.exploit.port);
                        modelPorts.push(modelPort);
                        return {
                            name: config.name,
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
                                  name: config.name,
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
                                  name: config.name,
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
                            "Unknown exploit type " +
                                `'${(unsupported as {type: string}).type}'`,
                        );
                    }
                }
            }) as [SimArgsAgent, SimArgsAgent];

            const gameResult = await playGame(
                {
                    agents,
                    ...(gameWorkerData.maxTurns && {
                        maxTurns: gameWorkerData.maxTurns,
                    }),
                    ...(msg.play.logPath && {logPath: msg.play.logPath}),
                    ...(msg.play.onlyLogOnError && {onlyLogOnError: true}),
                    ...(msg.play.seed && {seed: msg.play.seed}),
                },
                msg.play.experienceConfig,
            );

            result = {
                type: "play",
                rid: msg.rid,
                done: true,
                ...(gameResult.examples && {examples: gameResult.examples}),
                agents: gameResult.agents,
                winner: gameResult.winner,
                ...(gameResult.err && {err: serialize(gameResult.err)}),
            };
            if (result.examples) {
                transferList.push(
                    ...result.examples.flatMap(exp =>
                        exp.state.map(s => s.buffer),
                    ),
                );
            }
            if (result.err) {
                transferList.push(result.err.buffer);
            }
        } catch (err) {
            result = {
                type: "error",
                rid: msg.rid,
                done: true,
                err: serialize(err),
            };
            transferList.push(result.err.buffer);
        } finally {
            for (const port of modelPorts) {
                port.close();
            }
        }
        parentPort!.postMessage(result, transferList);
        callback();
    },
});

parentPort.on("message", function handle(msg: GameMessage) {
    switch (msg.type) {
        case "play":
            // Note: Due to stream buffering, this may not be immediately
            // processed.
            gameStream.write(msg);
            break;
        case "close":
            gameStream.end(() => {
                const response: WorkerClosed = {
                    type: "close",
                    rid: msg.rid,
                    done: true,
                };
                parentPort!.postMessage(response);
            });
            break;
    }
});
