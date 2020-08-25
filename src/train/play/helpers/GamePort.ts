import { deserialize } from "v8";
import { WorkerPort } from "../../helpers/workers/WorkerPort";
import { GamePoolArgs, GamePoolResult } from "../GamePool";
import { GameWorkerAgentConfig, GameWorkerPlay, GameWorkerRequestMap } from
    "./GameWorkerRequest";

/** Wraps a GamePool worker to provide Promise functionality. */
export class GamePort extends WorkerPort<GameWorkerRequestMap>
{
    /** Queues a game for the worker. */
    public async playGame(args: GamePoolArgs): Promise<GamePoolResult>
    {
        // request neural network ports
        const agentsPromise = Promise.all(
            args.agents.map(
                async config =>
                ({
                    port: await args.processor.subscribe(config.model),
                    exp: config.exp
                }))) as
                    Promise<[GameWorkerAgentConfig, GameWorkerAgentConfig]>;

        const msg: GameWorkerPlay =
        {
            type: "play", rid: this.generateRID(), simName: args.simName,
            agents: await agentsPromise,
            ...(args.maxTurns && {maxTurns: args.maxTurns}),
            ...(args.logPath && {logPath: args.logPath}),
            ...(args.rollout && {rollout: args.rollout})
        };

        return new Promise(res =>
            this.postMessage<"play">(msg, msg.agents.map(config => config.port),
                workerResult =>
                {
                    let result: GamePoolResult;
                    if (workerResult.type !== "error")
                    {
                        result =
                        {
                            numAExps: workerResult.numAExps,
                            winner: workerResult.winner,
                            // GamePort doesn't automatically deserialize errors
                            //  outside of PortResultError
                            ...(workerResult.err &&
                                {err: deserialize(workerResult.err)})
                        };
                    }
                    else result = {numAExps: 0, err: workerResult.err};

                    res(result);
                }));
    }
}
