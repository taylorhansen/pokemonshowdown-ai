import {isArrayBuffer} from "util/types";
import {serialize} from "v8";
import {parentPort, TransferListItem, workerData} from "worker_threads";
import {dedup} from "../../../util/dedup";
import {importTf} from "../../../util/importTf";
import {RawPortResultError} from "../../../util/port/PortProtocol";
import {rng} from "../../../util/random";
import {maxDamage} from "../../agent/maxDamage";
import {randomAgent} from "../../agent/random";
import {Experience, ExperienceContext} from "../../experience";
import {playGame, SimArgsAgent} from "../../sim/playGame";
import {AgentExperienceCallback, GameModel} from "./GameModel";
// Note: Dynamic import to prevent possible unnecessary TensorFlow dependency.
import type {GameModelArtifact} from "./GameModelArtifact";
import {GameModelPort} from "./GameModelPort";
import {
    GameCollectMessage,
    GameCollectResult,
    GameLoadMessage,
    GameLoadResult,
    GameMessage,
    GamePlayMessage,
    GamePlayResult,
    GameReloadMessage,
    GameReloadResult,
    GameResult,
    GameWorkerData,
} from "./GameProtocol";

if (!parentPort) {
    throw new Error("No parent port!");
}

// Used for debugging.
Error.stackTraceLimit = Infinity;

const gameWorkerData = workerData as GameWorkerData;

// Only load Tensorflow if the worker is configured for it.
let gameModelArtifactCtor: typeof GameModelArtifact | undefined;
let tfPromise: Promise<unknown> | undefined;
if (gameWorkerData.tf) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    tfPromise = importTf(gameWorkerData.tf).then(
        () =>
            (gameModelArtifactCtor = (
                require("./GameModelArtifact") as typeof import("./GameModelArtifact")
            ).GameModelArtifact),
    );
    /* eslint-enable @typescript-eslint/no-require-imports */
}

/** Registry for loaded models. */
const models = new Map<string, GameModel>();

async function load(msg: GameLoadMessage): Promise<GameLoadResult> {
    let model = models.get(msg.name);
    if (model) {
        throw new Error(
            `Model '${msg.name}' already exists` +
                (model.type === "artifact" ? ". Use type=reload instead." : ""),
        );
    }
    switch (msg.model.type) {
        case "artifact":
            await tfPromise;
            if (!gameModelArtifactCtor) {
                throw new Error(
                    "Tensorflow not configured for game worker " +
                        `'${gameWorkerData.name}'`,
                );
            }
            model = new gameModelArtifactCtor(msg.name, msg.model.config);
            await (model as GameModelArtifact).load(msg.model.artifact);
            break;
        case "port":
            model = new GameModelPort(msg.model.port);
            break;
        default: {
            const unsupportedModel: never = msg.model;
            throw new Error(
                "Unsupported model type " +
                    `'${(unsupportedModel as {type: string}).type}'`,
            );
        }
    }
    models.set(msg.name, model);
    return {type: "load", rid: msg.rid, done: true};
}

async function reload(msg: GameReloadMessage): Promise<GameReloadResult> {
    const model = models.get(msg.name);
    if (!model) {
        throw new Error(`Unknown model '${msg.name}'`);
    }
    if (model.type !== "artifact") {
        throw new Error(`Cannot reload ${model.type} model`);
    }
    await (model as GameModelArtifact).load(msg.artifact);
    return {type: "reload", rid: msg.rid, done: true};
}

async function play(msg: GamePlayMessage): Promise<GamePlayResult> {
    const experienceCtxs = new Map<string, ExperienceContext>();
    const agents = msg.agents.map<SimArgsAgent>(config => {
        switch (config.exploit.type) {
            case "model": {
                const model = models.get(config.exploit.model);
                if (!model) {
                    throw new Error(`Unknown model '${config.exploit.model}'`);
                }
                let agentExpCallback: AgentExperienceCallback | undefined;
                if (config.emitExperience && msg.play.experienceConfig) {
                    const ctx = new ExperienceContext(
                        msg.play.experienceConfig,
                        async exp =>
                            await new Promise(res => {
                                expBuffer.push({res, exp});
                                notifyExp?.();
                            }),
                    );
                    experienceCtxs.set(config.name, ctx);
                    agentExpCallback = async (state, choices, action, reward) =>
                        await ctx.add(state, choices, action, reward);
                }
                return {
                    name: config.name,
                    agent: model.getAgent(config.explore, agentExpCallback),
                    ...(config.emitExperience && {
                        emitExperience: true,
                    }),
                    ...(config.seed && {seed: config.seed}),
                };
            }
            case "random": {
                const agentRandom = config.exploit.seed
                    ? rng(config.exploit.seed)
                    : undefined;
                const {moveOnly} = config.exploit;
                return {
                    name: config.name,
                    agent:
                        moveOnly === "damage"
                            ? async (state, choices, logger) =>
                                  await maxDamage(
                                      state,
                                      choices,
                                      logger,
                                      agentRandom,
                                  )
                            : async (state, choices) =>
                                  await randomAgent(
                                      state,
                                      choices,
                                      moveOnly,
                                      agentRandom,
                                  ),
                    ...(config.seed && {seed: config.seed}),
                };
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
            ...(gameWorkerData?.maxTurns && {
                maxTurns: gameWorkerData.maxTurns,
            }),
            ...(msg.play.logPath && {logPath: msg.play.logPath}),
            ...(msg.play.onlyLogOnError && {onlyLogOnError: true}),
            ...(msg.play.seed && {seed: msg.play.seed}),
        },
        async (name, state, action, reward) =>
            await experienceCtxs.get(name)?.finalize(state, action, reward),
    );

    return {
        type: "play",
        rid: msg.rid,
        done: true,
        agents: gameResult.agents,
        winner: gameResult.winner,
        ...(gameResult.err && {err: serialize(gameResult.err)}),
    };
}

/** Buffered experiences with resolver callbacks. Max one per agent. */
const expBuffer: {res: () => void; exp: Experience[]}[] = [];
let notifyExp: (() => void) | null = null;

async function collect(msg: GameCollectMessage): Promise<GameCollectResult> {
    if (expBuffer.length <= 0) {
        await new Promise<void>(res => (notifyExp = res)).finally(
            () => (notifyExp = null),
        );
    }
    const experience = expBuffer.flatMap(({res, exp}) => (res(), exp));
    expBuffer.length = 0;
    return {
        type: "collect",
        rid: msg.rid,
        experience,
        done: true,
    };
}

const gamePromises = new Set<Promise<unknown>>();

async function handle(msg: GameMessage) {
    let result: GameResult | RawPortResultError;
    let transferList: TransferListItem[] | undefined;
    try {
        switch (msg.type) {
            case "load":
                result = await load(msg);
                break;
            case "reload":
                result = await reload(msg);
                break;
            case "play": {
                const gamePromise = play(msg);
                gamePromises.add(gamePromise);
                gamePromise.finally(() => gamePromises.delete(gamePromise));
                result = await gamePromise;
                if (result.err) {
                    transferList = [result.err.buffer];
                }
                break;
            }
            case "collect":
                result = await collect(msg);
                // Since some n-step experiences can share buffers between
                // multiple objects, we need to dedup the entire transfer first.
                transferList = dedup(
                    result.experience.flatMap(exp =>
                        [...exp.state, ...exp.nextState, exp.choices].flatMap(
                            a => (isArrayBuffer(a.buffer) ? [a.buffer] : []),
                        ),
                    ),
                );
                break;
            case "close": {
                await Promise.allSettled(gamePromises);
                const closePromises: Promise<void>[] = [];
                for (const [, model] of models) {
                    closePromises.push(model.destroy());
                }
                models.clear();
                await Promise.all(closePromises);
                result = {type: "close", rid: msg.rid, done: true};
                break;
            }
            default: {
                const unsupported: never = msg;
                throw new Error(
                    "Unsupported message type " +
                        `'${(unsupported as {type: string}).type}'`,
                );
            }
        }
    } catch (err) {
        result = {type: "error", rid: msg.rid, done: true, err: serialize(err)};
        transferList = [result.err.buffer];
    }
    parentPort!.postMessage(result, transferList);
}

parentPort.on("message", (msg: GameMessage) => void handle(msg));
