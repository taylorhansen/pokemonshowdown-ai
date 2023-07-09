import {LoginDetails} from "@pkmn/login";

/** Configuration for the PsBot. */
export interface PsBotConfig {
    /**
     * Websocket route to the Pokemon Showdown server instance. Typically either
     * a local instance `"ws://localhost:8000/"` or the official PS server
     * `"ws://sim.smogon.com:8000/"` (or `"wss://sim.smogon.com/"`) is used.
     */
    readonly websocketRoute: string;
    /** Path to the model to serve. */
    readonly modelPath: string;
    /** Confidence smoothing used in state encoder imputation algorithm. */
    readonly usageSmoothing?: number;
    /** Max batch size for inference. */
    readonly maxBatch: number;
    /** Login options. If unspecified, a guest account will be used instead. */
    readonly login: LoginConfig;
    /** Specify profile avatar. */
    readonly avatar?: string;
}

/** Config for PsBot login. */
export type LoginConfig = Omit<LoginDetails, "challstr">;
