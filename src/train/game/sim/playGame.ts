import {PRNGSeed} from "@pkmn/sim";
import {ExperienceConfig} from "../../../config/types";
import {BattleAgent} from "../../../psbot/handlers/battle/agent";
import {BattleParser} from "../../../psbot/handlers/battle/parser/BattleParser";
import {main} from "../../../psbot/handlers/battle/parser/main";
import {
    createTrainingExamples,
    Experience,
    ExperienceAgent,
    TrainingExample,
} from "../experience";
import {experienceBattleParser, PlayerOptions, startPsBattle} from "./ps";

/** Base interface for {@link SimArgsAgent}. */
interface SimArgsAgentBase<TAgent extends BattleAgent, TExp extends boolean> {
    /** Name for logging. */
    readonly name: string;
    /** BattleAgent function. */
    readonly agent: TAgent;
    /**
     * Whether the {@link agent} emits ExperienceAgentData that should be used
     * to generate {@link Experience} objects.
     */
    readonly emitExperience: TExp;
    /** Seed for generating the random team. */
    readonly seed?: PRNGSeed;
}

/**
 * {@link SimArgsAgent} that doesn't emit ExperienceAgentData or wants that data
 * to be ignored.
 */
export type SimArgsNoexpAgent = SimArgsAgentBase<BattleAgent, false>;
/** {@link SimArgsAgent} that emits ExperienceAgentData. */
export type SimArgsExpAgent = SimArgsAgentBase<ExperienceAgent, true>;

/** Config for a {@link BattleAgent}. */
export type SimArgsAgent = SimArgsNoexpAgent | SimArgsExpAgent;

/** Arguments for BattleSim functions. */
export interface SimArgs {
    /** The two agents that will play against each other. */
    readonly agents: readonly [SimArgsAgent, SimArgsAgent];
    /**
     * Maximum amount of turns until the game is considered a tie. Games can go
     * on forever if this is not set and both agents only decide to switch.
     */
    readonly maxTurns?: number;
    /** Path to the file to store logs in. */
    readonly logPath?: string;
    /** Seed for the battle PRNG. */
    readonly seed?: PRNGSeed;
}

/** Base simulator result type. */
export interface SimResult {
    /** Names of the two agents that participated in the game. */
    agents: [string, string];
    /** Index of the winner from {@link agents}. */
    winner?: 0 | 1;
    /**
     * If an exception was thrown during the game, store it here instead of
     * propagating it through the pipeline.
     */
    err?: Error;
}

/** Result of a game after it has been completed and processed by the worker. */
export interface PlayGameResult extends SimResult {
    /** Processed Experience objects suitable for learning. */
    examples: TrainingExample[];
}

/**
 * Plays a single game and processes the results.
 *
 * @param args Arguments for the simulator.
 * @param expConfig Config for processing {@link Experience}s (if any
 * BattleAgents are configured to emit them) into {@link TrainingExample}s
 * suitable for learning. If omitted, the Experiences will instead be discarded.
 */
export async function playGame(
    args: SimArgs,
    expConfig?: ExperienceConfig,
): Promise<PlayGameResult> {
    // Detect battle agents that want to generate Experience objects.
    const experiences: Experience[][] = [];
    const [p1, p2] = args.agents.map<PlayerOptions>(function (agentArgs) {
        if (!agentArgs.emitExperience) {
            return {
                name: agentArgs.name,
                agent: agentArgs.agent,
                ...(agentArgs.seed && {seed: agentArgs.seed}),
            };
        }

        // Agent is configured to emit partial Experience data, so override the
        // BattleParser to process them into full Experience objects.
        const exps: Experience[] = [];
        experiences.push(exps);
        return {
            name: agentArgs.name,
            agent: agentArgs.agent,
            parser: agentArgs.emitExperience
                ? (experienceBattleParser(
                      main,
                      exp => exps.push(exp),
                      agentArgs.name /*username*/,
                  ) as BattleParser<BattleAgent, [], void>)
                : main,
            ...(agentArgs.seed && {seed: agentArgs.seed}),
        };
    });

    // Play the game.
    const {winner, err} = await startPsBattle({
        players: {p1, p2},
        ...(args.maxTurns && {maxTurns: args.maxTurns}),
        ...(args.logPath && {logPath: args.logPath}),
        ...(args.seed && {seed: args.seed}),
    });

    const examples: TrainingExample[] = [];
    if (expConfig && !err) {
        // Process experiences as long as the game wasn't errored.
        for (const batch of experiences) {
            examples.push(...createTrainingExamples(batch, expConfig));
        }
    }

    return {
        agents: [args.agents[0].name, args.agents[1].name],
        // Pass winner id as an index corresponding to agents/experiences.
        ...(winner && {winner: winner === args.agents[0].name ? 0 : 1}),
        ...(err && {err}),
        examples,
    };
}
