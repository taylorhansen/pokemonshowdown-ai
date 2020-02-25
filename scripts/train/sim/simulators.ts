import * as tf from "@tensorflow/tfjs-node";
import { Experience } from "./helpers/Experience";
import { startPSBattle } from "./ps/startPSBattle";
import { PlayerID } from "../../../src/psbot/helpers";
import { ExperienceNetwork } from "./helpers/ExperienceNetwork";
import { ExperiencePSBattle } from "./ps/ExperiencePSBattle";
import { NetworkAgent } from "../../../src/ai/NetworkAgent";
import { PSBattle } from "../../../src/psbot/PSBattle";

/** Arguments for BattleSim functions. */
export interface SimArgs
{
    /** The two neural networks that will play against each other. */
    readonly models: readonly [tf.LayersModel, tf.LayersModel];
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both agents only decide to switch.
     */
    readonly maxTurns?: number;
    /**
     * Whether to emit Experience objects collected from both sides. Default
     * false.
     */
    readonly emitExperience?: boolean;
    /** Path to the file to store logs in. */
    readonly logPath?: string;
}

/** Return type of a BattleSim. */
export interface SimResult
{
    /** Experience objects, separated by each side of the battle. */
    experiences: Experience[][];
    /** Index of the winner from `SimArgs#models`. */
    winner?: 0 | 1;
}

/** Abstract function type for simulating a battle. */
export type BattleSim = (args: SimArgs) => Promise<SimResult>

const simulatorsImpl =
{
    /** Pokemon Showdown simulator */
    async ps({models, maxTurns, emitExperience, logPath}: SimArgs):
        Promise<SimResult>
    {
        let experiences: Experience[][];

        let net1: NetworkAgent;
        let net2: NetworkAgent;
        let psBattleCtor: typeof PSBattle;
        if (emitExperience === true)
        {
            const splitExp: {[P in PlayerID]: Experience[]} = {p1: [], p2: []};
            net1 = new ExperienceNetwork(models[0], "stochastic");
            net2 = new ExperienceNetwork(models[1], "stochastic");
            // tslint:disable-next-line: class-name
            psBattleCtor = class extends ExperiencePSBattle
            {
                protected async emitExperience(exp: Experience): Promise<void>
                {
                    splitExp[this.username as PlayerID].push(exp);
                }
            }
            experiences = [splitExp.p1, splitExp.p2];
        }
        else
        {
            net1 = new NetworkAgent(models[0], "stochastic");
            net2 = new NetworkAgent(models[1], "stochastic");
            psBattleCtor = PSBattle;
            experiences = [];
        }

        const winnerId = await startPSBattle(
        {
            p1: {agent: net1, psBattleCtor},
            p2: {agent: net2, psBattleCtor}, maxTurns, logPath
        });

        return {
            experiences,
            ...(winnerId && {winner: winnerId === "p1" ? 0 : 1})
        };
    }
} as const;

/** Collection of currently implemented simulators. */
export const simulators: {[N in keyof typeof simulatorsImpl]: BattleSim} =
    simulatorsImpl;
