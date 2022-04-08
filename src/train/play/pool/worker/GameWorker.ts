import {deserialize} from "v8";
import {Worker} from "worker_threads";
import {WorkerPort} from "../../../port/WorkerPort";
import {GamePoolArgs, GamePoolResult} from "../GamePool";
import {GameProtocol, GameAgentConfig, GamePlay} from "./GameProtocol";

/** Wraps a GamePool worker to provide Promise functionality. */
export class GameWorker {
    /** Port wrapper. */
    private readonly workerPort: WorkerPort<GameProtocol, keyof GameProtocol>;

    /**
     * Creates a GameWorker.
     *
     * @param worker `worker_threads` Worker object.
     */
    public constructor(worker: Worker) {
        this.workerPort = new WorkerPort(worker);
    }

    /** Safely closes the worker. */
    public async close(): Promise<void> {
        await this.workerPort.close();
    }

    /** Queues a game for the worker. */
    public async playGame(args: GamePoolArgs): Promise<GamePoolResult> {
        const msg: GamePlay = {
            type: "play",
            rid: this.workerPort.nextRid(),
            agents: await Promise.all(
                args.agents.map(async agentConfig => ({
                    exploit:
                        agentConfig.exploit.type === "model"
                            ? {
                                  type: "model",
                                  // Resolve model ids into usable model ports.
                                  port: await args.models.subscribe(
                                      agentConfig.exploit.model,
                                  ),
                              }
                            : agentConfig.exploit,
                    ...(agentConfig.explore && {explore: agentConfig.explore}),
                    ...(agentConfig.emitExperience && {emitExperience: true}),
                    ...(agentConfig.seed && {seed: agentConfig.seed}),
                })) as [Promise<GameAgentConfig>, Promise<GameAgentConfig>],
            ),
            play: args.play,
        };

        return await new Promise(res =>
            this.workerPort.postMessage<"play">(
                msg,
                msg.agents.flatMap(config =>
                    config.exploit.type === "model"
                        ? [config.exploit.port]
                        : [],
                ),
                workerResult => {
                    let result: GamePoolResult;
                    if (workerResult.type !== "error") {
                        result = {
                            id: args.id,
                            ...(workerResult.numExamples !== undefined && {
                                numExamples: workerResult.numExamples,
                            }),
                            winner: workerResult.winner,
                            // GamePort doesn't automatically deserialize errors
                            // outside of PortResultError (where type=error).
                            ...(workerResult.err && {
                                err: deserialize(workerResult.err) as Error,
                            }),
                        };
                    } else {
                        result = {
                            id: args.id,
                            err: workerResult.err,
                        };
                    }

                    res(result);
                },
            ),
        );
    }
}
