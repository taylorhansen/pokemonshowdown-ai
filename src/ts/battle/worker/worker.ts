/** @file Worker script for simulating multi-agent battle environments. */
import * as zmq from "zeromq";
import {Logger} from "../../utils/logging/Logger";
import {rng} from "../../utils/random";
import {Action, BattleAgent} from "../agent";
import {maxDamage} from "../agent/maxDamage.js";
import {randomAgent} from "../agent/random.js";
import {main} from "../parser/main";
import {ReadonlyBattleState} from "../state";
import {allocEncodedState, encodeState} from "../state/encoder";
import {PlayerOptions, simulateBattle} from "./battle";
import {
    ExperienceBattleParserResult,
    experienceBattleParser,
} from "./experienceBattleParser";
import {
    AgentFinalRequest,
    AgentReply,
    AgentRequest,
    BattleAgentOptions,
    BattleReply,
    BattleRequest,
    WorkerAck,
    WorkerReady,
} from "./protocol";

/** Worker class for serving simulation battles. */
class BattleWorker {
    /** Socket for receiving battle requests. */
    private readonly battleSock: zmq.Dealer;
    /** Socket for sending agent requests. */
    private readonly agentSock: zmq.Dealer;

    /** Collection of currently-running battles. */
    private readonly pendingBattles = new Set<Promise<void>>();
    /** Callbacks for async agent requests. */
    private readonly agentReplyCallbacks = new Map<
        string,
        Map<string, (rep: AgentReply) => void>
    >();
    /** Task for extracting async agent replies. */
    private agentPullerPromise?: Promise<void>;

    /** Whether the worker is closed. */
    private closed = false;

    /**
     * Creates a BattleWorker.
     *
     * @param addrId Id for socket address.
     * @param workerId Routing id for the worker.
     */
    public constructor(
        public readonly addrId: string,
        public readonly workerId: string,
    ) {
        const context = new zmq.Context();
        this.battleSock = new zmq.Dealer({
            context,
            routingId: workerId,
            linger: 0,
        });
        this.agentSock = new zmq.Dealer({
            context,
            routingId: workerId,
            linger: 0,
        });
    }

    /** Initializes sockets. */
    public async ready(): Promise<void> {
        if (this.agentPullerPromise) {
            // Already called.
            return;
        }

        // Establish battle server connection via handshake.
        this.battleSock.connect(`ipc:///tmp/psai-battle-socket-${this.addrId}`);
        const battleReady: WorkerReady = {type: "ready"};
        await this.battleSock.send(JSON.stringify(battleReady));
        const [battleAckBuf] = await this.battleSock.receive();
        const battleAck = JSON.parse(battleAckBuf.toString()) as WorkerAck;
        if (battleAck.type !== "ack") {
            throw new Error(`Unknown ack type '${battleAck.type}'`);
        }

        // Establish agent server connection via handshake.
        this.agentSock.connect(`ipc:///tmp/psai-agent-socket-${this.addrId}`);

        const agentReady: WorkerReady = {type: "ready"};
        await this.agentSock.send(JSON.stringify(agentReady));
        const [agentAckBuf] = await this.agentSock.receive();
        const agentAck = JSON.parse(agentAckBuf.toString()) as WorkerAck;
        if (agentAck.type !== "ack") {
            throw new Error(`Unknown ack type '${agentAck.type}'`);
        }

        this.agentPullerPromise = this.agentPuller();
        this.agentPullerPromise.catch(e =>
            console.error(
                `${this.workerId}:`,
                `Uncaught error in agent puller:`,
                e,
            ),
        );
    }

    /** Runs the worker to serve battle requests. */
    public async run(): Promise<void> {
        for await (const [msg] of this.battleSock) {
            const req = JSON.parse(msg.toString()) as BattleRequest;
            if (req.type !== "battle") {
                throw new Error(`Unknown request type '${req.type}'`);
            }

            // Since the simulator is very efficient compared to the number
            // crunching required by the model agents (which can batch multiple
            // requests for the same agent), we allow this single-threaded Node
            // server to run many battles "in parallel" (asynchronously).
            // As for how many parallel/async battles should be allowed, load
            // balancing/etc is handled by the sender.
            const battlePromise = this.dispatchBattle(req).catch(e =>
                console.error(
                    `${this.workerId}:`,
                    `Uncaught error in battle ${req.id}:`,
                    e,
                ),
            );
            this.pendingBattles.add(battlePromise);
            battlePromise.finally(() =>
                this.pendingBattles.delete(battlePromise),
            );
        }
        await Promise.all(this.pendingBattles);
    }

    /** Closes the worker. */
    public close(): void {
        this.battleSock.close();
        this.agentSock.close();
        this.closed = true;
    }

    /** Extracts async agent replies. */
    private async agentPuller(): Promise<void> {
        while (!this.closed) {
            const msg = await this.agentSock.receive();
            if (msg.length > 1) {
                throw new Error(
                    `Expected length 1 agent msg but got ${msg.length}`,
                );
            }
            const rep = JSON.parse(msg[0].toString()) as AgentReply;
            const m = this.agentReplyCallbacks.get(rep.battle);
            if (!m) {
                throw new Error(`Battle '${rep.battle}' is not running`);
            }
            const cb = m.get(rep.name);
            if (!cb) {
                throw new Error(
                    `Unexpected reply for agent '${rep.name}' in battle ` +
                        `'${rep.battle}'`,
                );
            }
            cb(rep);
        }
    }

    /** Dispatches a battle simulation. */
    private async dispatchBattle(req: BattleRequest) {
        if (this.agentReplyCallbacks.has(req.id)) {
            throw new Error(`Battle '${req.id}' is already running`);
        }
        this.agentReplyCallbacks.set(req.id, new Map());
        let rep: BattleReply;
        try {
            const result = await simulateBattle({
                players: {
                    p1: this.configurePlayer(req.agents.p1, req.id),
                    p2: this.configurePlayer(req.agents.p2, req.id),
                },
                ...(req.maxTurns && {maxTurns: req.maxTurns}),
                ...(req.logPath && {logPath: req.logPath}),
                ...(req.onlyLogOnError && {onlyLogOnError: true}),
                ...(req.seed && {seed: req.seed}),
            });
            rep = {
                type: "battle",
                id: req.id,
                agents: {p1: req.agents.p1.name, p2: req.agents.p2.name},
                ...(result.winner !== undefined && {
                    winner: result.winner,
                }),
                ...(result.truncated && {truncated: true}),
                ...(result.err && {
                    err: result.err.stack ?? result.err.toString(),
                }),
            };
        } catch (err) {
            rep = {
                type: "battle",
                id: req.id,
                agents: {p1: req.agents.p1.name, p2: req.agents.p2.name},
                err: (err as Error).stack ?? (err as Error).toString(),
            };
        }
        await this.battleSock.send(JSON.stringify(rep));
    }

    /** Sets up player config for a battle simulation. */
    private configurePlayer(
        options: BattleAgentOptions,
        battle: string,
    ): PlayerOptions {
        if (options.type !== "model") {
            // Custom agent that doesn't rely on model agent server.
            return {
                name: options.name,
                agent: BattleWorker.getCustomAgent(
                    options.type,
                    options.randSeed,
                ),
                async parser(ctx) {
                    await main(ctx);
                    return undefined;
                },
                ...(options.teamSeed && {seed: options.teamSeed}),
            };
        }
        return {
            name: options.name,
            agent: async (
                state: ReadonlyBattleState,
                choices: Action[],
                logger?: Logger,
                lastAction?: Action,
                reward?: number,
            ) =>
                await this.socketAgent(
                    battle,
                    options.model!,
                    state,
                    choices,
                    logger,
                    lastAction,
                    reward,
                ),
            parser: async ctx => {
                let result: ExperienceBattleParserResult | undefined;
                try {
                    if (!options.experience) {
                        return await main(ctx);
                    }
                    result = await experienceBattleParser(
                        main,
                        options.name,
                    )(ctx);
                } finally {
                    const req: AgentFinalRequest = {
                        type: "agent_final",
                        battle,
                        name: options.model!,
                        ...(result && {
                            action: result.action,
                            reward: result.reward,
                            ...(result.terminated && {terminated: true}),
                        }),
                    };
                    await this.agentSock.send(JSON.stringify(req));
                }
            },
            ...(options.teamSeed && {seed: options.teamSeed}),
        };
    }

    /** {@link BattleAgent}-like function that wraps the agent socket. */
    private async socketAgent(
        battle: string,
        name: string,
        state: ReadonlyBattleState,
        choices: Action[],
        logger?: Logger,
        lastAction?: Action,
        reward?: number,
    ): Promise<void> {
        const m = this.agentReplyCallbacks.get(battle);
        if (!m) {
            throw new Error(`Battle '${battle}' is not running`);
        }
        if (m.has(name)) {
            throw new Error(
                `Already waiting for reply for agent '${name}' in battle ` +
                    `'${battle}'`,
            );
        }
        const replyPromise = new Promise<AgentReply>(res =>
            m.set(name, res),
        ).finally(() => m.delete(name));

        const {data: stateData, original} = allocEncodedState();
        encodeState(stateData, state);
        const req: AgentRequest = {
            type: "agent",
            battle,
            name,
            choices,
            ...(lastAction && {lastAction}),
            ...(reward !== undefined && {reward}),
        };
        await this.agentSock.send([JSON.stringify(req), original.buffer]);

        const rep = await replyPromise;
        if (battle !== rep.battle || name !== rep.name) {
            // Should never happen.
            throw new Error(
                `Requested agent '${name}' decision for battle '${battle}' ` +
                    `but got battle '${rep.battle}', agent '${rep.name}'`,
            );
        }
        logger?.debug(`All ranked actions: [${rep.rankedActions.join(", ")}]`);
        // Sort available choices by rank.
        choices.sort(
            (a, b) =>
                rep.rankedActions.indexOf(a) - rep.rankedActions.indexOf(b),
        );
    }

    /** Creates a custom built-in agent that doesn't use the agent socket. */
    private static getCustomAgent(agent: string, seed?: string): BattleAgent {
        const random = seed !== undefined ? rng(seed) : undefined;
        switch (agent) {
            case "max_damage":
                return async (state, choices, logger) =>
                    await maxDamage(state, choices, logger, random);
            case "random_move":
                return async (state, choices) =>
                    await randomAgent(
                        state,
                        choices,
                        true /*moveOnly*/,
                        random,
                    );
            case "random":
                return async (state, choices) =>
                    await randomAgent(
                        state,
                        choices,
                        false /*moveOnly*/,
                        random,
                    );
            default:
                throw new Error(`Unknown custom agent '${agent}'`);
        }
    }
}

void (async function pyJsBattleWorker() {
    const [, , addrId, workerId] = process.argv;
    const worker = new BattleWorker(addrId, workerId);
    try {
        await worker.ready();
        await worker.run();
    } catch (e) {
        console.error(`${workerId}:`, e);
    } finally {
        worker.close();
    }
})();
