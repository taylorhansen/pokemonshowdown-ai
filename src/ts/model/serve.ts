import {ChildProcess, spawn} from "child_process";
import * as path from "path";
import * as readline from "readline";
import * as zmq from "zeromq";
import {Action} from "../battle/agent";
import {ReadonlyBattleState} from "../battle/state";
import {stateEncoder} from "../battle/state/encoder";
import {UsageStats} from "../battle/usage";
import {Logger} from "../utils/logging/Logger";

// eslint-disable-next-line @typescript-eslint/naming-convention
const PYTHONPATH = path.resolve(__dirname, "..", "..", "..");

/** Ensures that the model server has been started. */
interface Ready {
    type: "ready";
}

/** Sent by the model server to acknowledge {@link Ready}. */
interface Ack {
    type: "ack";
}

/**
 * Model prediction request protocol. Encoded state data is sent in a separate
 * buffer.
 */
interface ModelRequest {
    type: "model";
    /** Differentiates multiple requests from the same client. */
    id: number;
    /**
     * Key for looking up hidden states or other context used to continue a
     * battle.
     */
    key: string;
}

/** Model prediction reply protocol. */
interface ModelReply {
    type: "model";
    /** Differentiates multiple requests from the same client. */
    id: number;
    /** All possible actions ranked by the model. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ranked_actions: Action[];
    /** Predicted Q-values for each action. */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    q_values?: {[T in Action]: number};
}

/** Request protocol for cleaning up stored prediction context from a battle. */
interface CleanupRequest {
    type: "cleanup";
    /** Key identifier for the stored context. */
    key: string;
}

/** Contains prediction data from the model server. */
export interface ModelPrediction {
    /** All possible actions ranked by the model. */
    rankedActions: Action[];
    /** Predicted Q-values for each action. Optional debug info. */
    qValues?: {[T in Action]: number};
}

/** Server class for handling model predictions. */
export class ModelServer {
    /** Manages the Python subprocess. */
    private serveProcess?: ChildProcess;
    /** Used for communicating with the subprocess. */
    private socket?: zmq.Dealer;

    /** Callbacks for pending requests. */
    private readonly pendingRequests = new Map<
        number,
        (rep: ModelReply) => void
    >();
    /** Counter for numbering requests. */
    private requestCount = 0;

    /** Task for extracting async agent replies. */
    private pullerPromise?: Promise<void>;

    /** Whether the server is closed. */
    private closed = false;

    /**
     * Creates a ModelServer.
     *
     * @param modelPath Path to the model to serve.
     * @param socketId Id to use for the socket.
     * @param maxBatch Max batch size for inference.
     * @param logger Logger object.
     */
    public constructor(
        public readonly modelPath: string,
        public readonly socketId: string,
        public readonly maxBatch: number,
        private readonly logger: Logger,
    ) {}

    /** Starts the server. */
    public async start(): Promise<void> {
        this.serveProcess = spawn(
            "python",
            [
                "-u", // Unbuffered stdout/stderr.
                "-m",
                "src.py.serve",
                this.modelPath,
                this.socketId,
                "--max-batch",
                this.maxBatch.toString(),
                "--debug-outputs",
            ],
            // eslint-disable-next-line @typescript-eslint/naming-convention
            {env: {...process.env, PYTHONPATH}, stdio: "pipe"},
        );

        const rl = readline.createInterface({
            input: this.serveProcess.stdout!,
            terminal: false,
        });
        rl.on("line", line => this.logger.debug(line));

        const rlErr = readline.createInterface({
            input: this.serveProcess.stderr!,
            terminal: false,
        });
        rlErr.on("line", line => this.logger.error(line));

        const context = new zmq.Context();
        this.socket = new zmq.Dealer({context, linger: 0});
        this.socket.connect(`ipc:///tmp/psai-serve-socket-${this.socketId}`);

        // Ensure worker has started successfully.
        const ready: Ready = {type: "ready"};
        await this.socket.send(JSON.stringify(ready));

        this.socket.receiveTimeout = 60_000 /*60s*/;
        const [ackBuf] = await this.socket.receive();
        this.socket.receiveTimeout = -1;

        const ack = JSON.parse(ackBuf.toString()) as Ack;
        if (ack.type !== "ack") {
            throw new Error(`Invalid ack received: ${ackBuf.toString()}`);
        }

        this.pullerPromise = this.puller();
        this.pullerPromise.catch(e =>
            this.logger.error(
                `Uncaught error in puller: ${(e as Error).stack ?? e}`,
            ),
        );
    }

    /** Closes the server. */
    public close() {
        this.serveProcess?.kill();
        this.socket?.close();
        this.closed = true;
    }

    /**
     * Sends a model prediction request and awaits its response.
     *
     * @param key Key for looking up stored context used to continue a battle.
     * Should be unique for each battle perspective.
     * @param state Battle state representation.
     * @param usage Usage stats to impute for state encoder.
     * @param smoothing Confidence smoothing used in imputation algorithm.
     * @returns Prediction data from the model server.
     */
    public async predict(
        key: string,
        state: ReadonlyBattleState,
        usage?: UsageStats,
        smoothing?: number,
    ): Promise<ModelPrediction> {
        const req: ModelRequest = {type: "model", id: ++this.requestCount, key};
        const stateData = new Float32Array(stateEncoder.size);
        stateEncoder.encode(stateData, {state, usage, smoothing});

        const replyPromise = new Promise<ModelReply>(res =>
            this.pendingRequests.set(req.id, res),
        ).finally(() => this.pendingRequests.delete(req.id));

        await this.ensureSocket().send([JSON.stringify(req), stateData.buffer]);
        const reply = await replyPromise;
        return {
            rankedActions: reply.ranked_actions,
            ...(reply.q_values && {qValues: reply.q_values}),
        };
    }

    /**
     * Cleans up stored context from battle predictions.
     *
     * @param key Context key.
     */
    public async cleanup(key: string): Promise<void> {
        const req: CleanupRequest = {type: "cleanup", key};
        await this.ensureSocket().send([JSON.stringify(req)]);
    }

    /** Extracts async predictions from the subprocess. */
    private async puller(): Promise<void> {
        while (!this.closed) {
            const [replyBuffer] = await this.ensureSocket().receive();
            const reply = JSON.parse(replyBuffer.toString()) as ModelReply;
            if (reply.type !== "model") {
                throw new Error(`Unknown reply type '${reply.type}'`);
            }
            const cb = this.pendingRequests.get(reply.id);
            if (!cb) {
                throw new Error(`Unexpected reply id ${reply.id}`);
            }
            cb(reply);
        }
    }

    /** Asserts initialization precondition. */
    private ensureSocket(): zmq.Dealer {
        if (!this.socket) {
            throw new Error("ModelServer wasn't started or was closed");
        }
        return this.socket;
    }
}
