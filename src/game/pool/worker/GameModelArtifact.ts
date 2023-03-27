import * as tf from "@tensorflow/tfjs";
import {BatchPredictConfig} from "../../../config/types";
import {verifyInputData, verifyOutputData} from "../../../model/verify";
import {BatchPredict} from "../../../model/worker/BatchPredict";
import {ModelRegistry} from "../../../model/worker/ModelRegistry";
import {
    allocEncodedState,
    encodeState,
} from "../../../psbot/handlers/battle/ai/encoder";
import {deserializeModel} from "../../../util/model";
import {createGreedyAgent} from "../../agent/greedy";
import {ExperienceBattleAgent} from "../../experience";
import {AgentExperienceCallback, GameModel} from "./GameModel";
import {AgentExploreConfig} from "./GameProtocol";

tf.enableProdMode();

/** Keeps a real TF model for the worker to use during games. */
export class GameModelArtifact implements GameModel<"artifact"> {
    /** @override */
    public readonly type = "artifact";

    /** Wrapped model. */
    private model?: ModelRegistry;
    /** Batch predict profile. */
    private profile?: BatchPredict;

    /**
     * Creates a GameModelArtifact.
     *
     * @param name Name of model.
     */
    public constructor(private readonly name: string) {}

    /**
     * Loads the model or replaces it. Can be called while games are still in
     * progress.
     *
     * @param artifact Serialized model.
     * @param config Config for batching predictions on this thread.
     */
    public async load(
        artifact: tf.io.ModelArtifacts,
        config: BatchPredictConfig,
    ): Promise<void> {
        const model = await deserializeModel(artifact);
        this.destroy();
        this.model = new ModelRegistry(this.name, model);
        this.profile = this.model.configure("agent", config);
    }

    /** @override */
    public getAgent(
        explore?: AgentExploreConfig,
        expCallback?: AgentExperienceCallback,
        debugRankings?: boolean,
    ): ExperienceBattleAgent {
        return createGreedyAgent(
            async (state, choices, lastAction?: number, reward?: number) => {
                // Note: Need shared buffers due to multiple experience
                // transfers.
                const stateData = allocEncodedState(expCallback && "shared");
                encodeState(stateData, state);
                verifyInputData(stateData);

                await expCallback?.(stateData, choices, lastAction, reward);

                const {output} = await this.ensureProfile().predict(stateData);
                verifyOutputData(output);
                return output;
            },
            explore,
            debugRankings,
        );
    }

    /** @override */
    public destroy(): void {
        if (!this.model) {
            return;
        }
        if (this.profile) {
            this.model.deconfigure(this.profile.name);
            this.profile = undefined;
        }
        this.model.unload();
        this.model = undefined;
    }

    private ensureProfile(): BatchPredict {
        // Should never happen.
        if (!this.profile) {
            throw new Error("Model not loaded");
        }
        return this.profile;
    }
}
