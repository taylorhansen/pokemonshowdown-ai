import {isArrayBuffer} from "util/types";
import {deserialize} from "v8";
import {Worker} from "worker_threads";
import {WorkerPort} from "../../../util/worker/WorkerPort";
import {Experience} from "../../experience";
import {GamePoolArgs, GamePoolResult} from "../GamePool";
import {GameProtocol, GameLoadModel} from "./GameProtocol";

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

    /** Force-closes the worker. */
    public async terminate(): Promise<void> {
        await this.workerPort.terminate();
    }

    /**
     * Loads and registers a model for inference during games.
     *
     * @param name Name under which to refer to the model during calls to
     * {@link play}.
     * @param model Config for loading the model.
     */
    public async load(name: string, model: GameLoadModel): Promise<void> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"load">(
                {type: "load", rid: this.workerPort.nextRid(), name, model},
                model.type === "port"
                    ? [model.port]
                    : model.type === "artifact"
                    ? [
                          model.artifact.modelTopology,
                          model.artifact.weightData,
                      ].filter(isArrayBuffer)
                    : [],
                result => (result.type === "error" ? rej(result.err) : res()),
            ),
        );
    }

    /**
     * Reloads a model that was loaded in `artifact` mode.
     *
     * @param name Name of model.
     * @param data Serialized model weights. Data layout must match the original
     * model.
     */
    public async reload(name: string, data: ArrayBufferLike): Promise<void> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"reload">(
                {
                    type: "reload",
                    rid: this.workerPort.nextRid(),
                    name,
                    data,
                },
                isArrayBuffer(data) ? [data] : [],
                result => (result.type === "error" ? rej(result.err) : res()),
            ),
        );
    }

    /** Launches a game and awaits the result. */
    public async play(args: GamePoolArgs): Promise<GamePoolResult> {
        return await new Promise(res =>
            this.workerPort.postMessage<"play">(
                {
                    type: "play",
                    rid: this.workerPort.nextRid(),
                    agents: args.agents,
                    play: args.play,
                },
                [] /*transferList*/,
                result =>
                    result.type === "error"
                        ? res({
                              id: args.id,
                              agents: [
                                  args.agents[0].name,
                                  args.agents[1].name,
                              ],
                              err: result.err,
                          })
                        : res({
                              id: args.id,
                              agents: result.agents,
                              winner: result.winner,
                              // Manually deserialize game error.
                              ...(result.err && {
                                  err: deserialize(result.err) as Error,
                              }),
                          }),
            ),
        );
    }

    /**
     * Collects generated experience from the game worker if the currently
     * running game and any agents were configured for it. Should be called
     * frequently since the worker can buffer or block otherwise.
     */
    public async collect(): Promise<Experience[]> {
        return await new Promise((res, rej) =>
            this.workerPort.postMessage<"collect">(
                {type: "collect", rid: this.workerPort.nextRid()},
                [] /*transferList*/,
                result =>
                    result.type === "error"
                        ? rej(result.err)
                        : res(result.experience),
            ),
        );
    }
}
