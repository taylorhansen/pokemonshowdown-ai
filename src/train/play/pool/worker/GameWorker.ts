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
        // Request neural network ports.
        const agentsPromise = Promise.all(
            args.agents.map(async config => ({
                port: await args.models.subscribe(config.model),
                exp: config.exp,
            })),
        ) as Promise<[GameAgentConfig, GameAgentConfig]>;

        const msg: GamePlay = {
            type: "play",
            rid: this.workerPort.nextRid(),
            format: args.format,
            agents: await agentsPromise,
            ...(args.maxTurns && {maxTurns: args.maxTurns}),
            ...(args.logPath && {logPath: args.logPath}),
            ...(args.rollout && {rollout: args.rollout}),
        };

        return await new Promise(res =>
            this.workerPort.postMessage<"play">(
                msg,
                msg.agents.map(config => config.port),
                workerResult => {
                    let result: GamePoolResult;
                    if (workerResult.type !== "error") {
                        result = {
                            id: args.id,
                            numAExps: workerResult.numAExps,
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
                            numAExps: 0,
                            err: workerResult.err,
                        };
                    }

                    res(result);
                },
            ),
        );
    }
}
