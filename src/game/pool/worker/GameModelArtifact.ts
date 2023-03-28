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
    private readonly model = new ModelRegistry(this.name);
    /** Batch predict profile. */
    private readonly profile = this.model.configure("agent", this.config);

    /**
     * Creates a GameModelArtifact.
     *
     * @param name Name of model.
     * @param config Batch predict config.
     */
    public constructor(
        public readonly name: string,
        public readonly config: BatchPredictConfig,
    ) {}

    /**
     * Loads the model or replaces it, such that any future and
     * currently-pending predict requests will use the new model.
     */
    public async load(artifact: tf.io.ModelArtifacts): Promise<void> {
        const model = await deserializeModel(artifact);
        await this.model.load(model);
    }

    /** Replaces the model's weights. */
    public async reload(
        data: ArrayBufferLike,
        specs: tf.io.WeightsManifestEntry[],
    ): Promise<void> {
        await this.model.reload(data, specs);
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
    public async destroy(): Promise<void> {
        await this.model.deconfigure(this.profile.name);
        await this.model.unload();
    }

    private ensureProfile(): BatchPredict {
        // Should never happen.
        if (!this.profile) {
            throw new Error("Model not loaded");
        }
        return this.profile;
    }
}
