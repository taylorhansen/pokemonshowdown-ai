import { formats } from "../../../psbot/handlers/battle";
import { BattleAgent } from "../../../psbot/handlers/battle/agent";
import { BattleParser } from "../../../psbot/handlers/battle/parser";
import { AdvantageConfig } from "../../learn";
import { AugmentedExperience, augmentExperiences, Experience, ExperienceAgent }
    from "../experience";
import { experienceBattleParser, PlayerOptions, startPsBattle } from "./ps";

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

/** Base simulator result type. */
export interface SimResult
{
    /** Index of the winner from `SimArgs#agents`. */
    winner?: 0 | 1;
    /**
     * If an exception was thrown during the game, store it here instead of
     * propagating it through the pipeline.
     */
    err?: Error;
}

/** Result of a game after it has been completed and processed by the worker. */
export interface PlayGameResult extends SimResult
{
    /** Processed Experience objects. */
    experiences: AugmentedExperience[];
}

/**
 * Plays a single game and processes the results.
 *
 * @param simName Name of the simulator to use.
 * @param args Arguments for the simulator.
 * @param rollout Config for processing Experiences if any BattleAgents are
 * configured to emit them. If omitted, the Experiences will be ignored.
 */
export async function playGame(format: formats.FormatType, args: SimArgs,
    rollout?: AdvantageConfig): Promise<PlayGameResult>
{
    // Detect battle agents that want to generate Experience objects.
    const experiences: Experience[][] = [];
    const [p1, p2] = args.agents.map<PlayerOptions>(function(agentArgs, i)
    {
        if (!agentArgs.exp) return {agent: agentArgs.agent};

        // Agent is configured to emit partial Experience data, so override the
        // BattleParser to process them into full Experience objects.
        const exps: Experience[] = [];
        experiences[i] = exps;
        const parser = formats.parser[format] as
            BattleParser<formats.FormatType>;
        return {
            agent: agentArgs.agent,
            parser: rollout ?
                experienceBattleParser(parser, exp => exps.push(exp),
                    // Note: startPSBattle uses raw SideID as username.
                    `p${i + 1}`) as BattleParser<formats.FormatType>
                : parser
        };
    });

    // Play the game.
    const {winner, err} = await startPsBattle(
    {
        format, players: {p1, p2}, maxTurns: args.maxTurns,
        logPath: args.logPath
    });

    const aexps: AugmentedExperience[] = [];
    if (rollout && !err)
    {
        // Process experiences as long as the game wasn't errored.
        for (const batch of experiences)
        {
            aexps.push(...augmentExperiences(batch, rollout));
        }
    }

    return {
        experiences: aexps,
        // Pass winner id as an index corresponding to agents/experiences.
        ...winner && {winner: winner === "p1" ? 0 : 1},
        ...err && {err}
    };
}
