import { BattleAgent } from "../../battle/agent/BattleAgent";
import { PlayerID } from "../../psbot/helpers";
import { PSBattle } from "../../psbot/PSBattle";
import { Experience, ExperienceAgent } from "./helpers/Experience";
import { ExperiencePSBattle } from "./ps/ExperiencePSBattle";
import { PlayerOptions, startPSBattle } from "./ps/startPSBattle";

/** Base interface for SimArgsAgent. */
interface SimArgsAgentBase<TAgent extends BattleAgent, TExp extends boolean>
{
    /** BattleAgent function. */
    agent: TAgent;
    /**
     * Whether the BattleAgent emits ExperienceAgentData that should be used to
     * generate Experience objects.
     */
    exp: TExp;
}

/**
 * SimArgsAgent that doesn't emit ExperienceAgentData or wants that data to be
 * ignored.
 */
export type SimArgsNoexpAgent = SimArgsAgentBase<BattleAgent, false>;
/** SimArgsAgent that emits ExperienceAgentData. */
export type SimArgsExpAgent = SimArgsAgentBase<ExperienceAgent, true>;

/** Config for a BattleAgent. */
export type SimArgsAgent = SimArgsNoexpAgent | SimArgsExpAgent;

/** Arguments for BattleSim functions. */
export interface SimArgs
{
    /** The two agents that will play against each other. */
    readonly agents: readonly [SimArgsAgent, SimArgsAgent];
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both agents only decide to switch.
     */
    readonly maxTurns?: number;
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
    /** Pokemon Showdown simulator. */
    async ps({agents, maxTurns, logPath}: SimArgs):
        Promise<SimResult>
    {
        // detect battle agents that want to generate Experience objects
        const splitExp: {[P in PlayerID]: Experience[]} = {p1: [], p2: []};
        let psBattleCtor: typeof PSBattle | undefined;
        const [p1, p2] = agents.map(function(agentArgs)
        {
            if (!agentArgs.exp) return agentArgs as PlayerOptions;

            if (!psBattleCtor)
            {
                psBattleCtor = class extends ExperiencePSBattle
                {
                    protected async emitExperience(exp: Experience):
                        Promise<void>
                    {
                        splitExp[this.username as PlayerID].push(exp);
                    }
                }
            }
            return {agent: agentArgs.agent, psBattleCtor} as PlayerOptions;
        });

        // play the game
        const winnerId = await startPSBattle({p1, p2, maxTurns, logPath});

        // find generated experiences
        const experiences: Experience[][] = [];
        if (splitExp.p1.length > 0) experiences.push(splitExp.p1);
        if (splitExp.p2.length > 0) experiences.push(splitExp.p2);
        return {
            experiences, ...(winnerId && {winner: winnerId === "p1" ? 0 : 1})
        };
    }
} as const;

/** Name for each implemented simulator. */
export type SimName = keyof typeof simulatorsImpl;

/** Collection of currently implemented simulators. */
export const simulators: {[N in SimName]: BattleSim} = simulatorsImpl;
