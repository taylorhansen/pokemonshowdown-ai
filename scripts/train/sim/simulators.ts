import * as tf from "@tensorflow/tfjs-node";
import { Experience } from "./helpers/Experience";
import { startPSBattle } from "./ps/startPSBattle";
import { PlayerID } from "../../../src/psbot/helpers";
import { ExperienceNetwork } from "./helpers/ExperienceNetwork";
import { ExperiencePSBattle } from "./ps/ExperiencePSBattle";
import { NetworkAgent } from "../../../src/ai/NetworkAgent";

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

export type BattleSim = (args: SimArgs) => Promise<Experience[][]>

const simulatorsImpl =
{
    async ps({models, maxTurns, emitExperience, logPath}: SimArgs):
        Promise<Experience[][]>
    {
        let net1: NetworkAgent;
        let net2: NetworkAgent;
        if (emitExperience === true)
        {
            const splitExp: {[P in PlayerID]: Experience[]} = {p1: [], p2: []};
            net1 = new ExperienceNetwork(models[0], "stochastic");
            net2 = new ExperienceNetwork(models[1], "stochastic");
            // tslint:disable-next-line: class-name
            class psBattleCtor extends ExperiencePSBattle
            {
                protected async emitExperience(exp: Experience): Promise<void>
                {
                    splitExp[this.username as PlayerID].push(exp);
                }
            }
            await startPSBattle(
            {
                p1: {agent: net1, psBattleCtor},
                p2: {agent: net2, psBattleCtor}, maxTurns, logPath
            });
            return [splitExp.p1, splitExp.p2];
        }

        net1 = new NetworkAgent(models[0], "stochastic");
        net2 = new NetworkAgent(models[1], "stochastic");
        await startPSBattle(
            {p1: {agent: net1}, p2: {agent: net2}, maxTurns, logPath});
        return [];
    }
} as const;

export const simulators: {[N in keyof typeof simulatorsImpl]: BattleSim} =
    simulatorsImpl;
