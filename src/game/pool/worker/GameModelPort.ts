import {MessagePort} from "worker_threads";
import {ModelPort} from "../../../model/port";
import {ExperienceBattleAgent} from "../../experience";
import {AgentExperienceCallback, GameModel} from "./GameModel";
import {AgentExploreConfig} from "./GameProtocol";

/** Keeps a port handle to a hosted model for the worker to use during games. */
export class GameModelPort implements GameModel<"port"> {
    public readonly type = "port";

    /** Protocol wrapper around the port. */
    private readonly port: ModelPort;

    /**
     * Creates a GameModelPort.
     *
     * @param port Message port for the hosted model on a separate worker.
     * Should obey the {@link ModelPort} protocol.
     */
    public constructor(port: MessagePort) {
        this.port = new ModelPort(port);
    }

    /** @override */
    public getAgent(
        explore?: AgentExploreConfig,
        expCallback?: AgentExperienceCallback,
        debugRankings?: boolean,
    ): ExperienceBattleAgent {
        return this.port.getAgent(explore, expCallback, debugRankings);
    }

    /** @override */
    // eslint-disable-next-line @typescript-eslint/require-await
    public async destroy(): Promise<void> {
        this.port.close();
    }
}
