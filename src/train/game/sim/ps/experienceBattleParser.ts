import {
    BattleAgent,
    Choice,
    choiceIds,
} from "../../../../psbot/handlers/battle/agent";
import {
    allocEncodedState,
    encodeState,
} from "../../../../psbot/handlers/battle/ai/encoder";
import {
    BattleParser,
    BattleParserContext,
} from "../../../../psbot/handlers/battle/parser/BattleParser";
import {ReadonlyBattleState} from "../../../../psbot/handlers/battle/state";
import {
    Experience,
    ExperienceAgent,
    ExperienceAgentData,
} from "../../experience/Experience";

/**
 * Wraps a BattleParser to track rewards/decisions and emit Experience objects.
 *
 * Returned wrapper requires an {@link ExperienceAgent}.
 *
 * @template TArgs Parser arguments.
 * @template TResult Parser return type.
 * @param parser Parser function to wrap.
 * @param callback Callback for emitting Experience objs.
 * @param username Client's username to parse game-over reward.
 * @returns The wrapped BattleParser function.
 */
export function experienceBattleParser<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    parser: BattleParser<BattleAgent, TArgs, TResult>,
    callback: (exp: Experience) => void,
    username: string,
): BattleParser<ExperienceAgent, TArgs, TResult> {
    return async function experienceBattleParserImpl(
        ctx: BattleParserContext<ExperienceAgent>,
        ...args: TArgs
    ): Promise<TResult> {
        let expAgentData: ExperienceAgentData | null = null;
        let lastChoice: Choice | null = null;
        let reward = 0;
        function emitExperience(state: ReadonlyBattleState, done = false) {
            if (!expAgentData || !lastChoice) {
                return;
            }
            // Collect data to emit an experience.
            const action = choiceIds[lastChoice];
            const nextState = allocEncodedState();
            encodeState(nextState, state);

            ctx.logger.info(`Emitting experience, reward=${reward}`);
            callback({
                ...expAgentData,
                action,
                reward,
                nextState,
                done,
            });
            // Reset collected data for the next decision.
            expAgentData = null;
            lastChoice = null;
            reward = 0;
        }

        // Start tracking the game.
        const result = await parser(
            {
                ...ctx,
                // Extract additional info from the ExperienceAgent.
                async agent(state, choices, logger) {
                    // Emit experience between last and current decision.
                    emitExperience(state);
                    expAgentData = await ctx.agent(state, choices, logger);
                },
                iter: {
                    ...ctx.iter,
                    async next() {
                        // Observe events before the parser consumes them.
                        const r = await ctx.iter.next();
                        if (
                            !r.done &&
                            ["win", "tie"].includes(r.value.args[0])
                        ) {
                            // Add win/loss reward.
                            reward += r.value.args[1] === username ? 1 : -1;
                        }
                        return r;
                    },
                },
                // Extract the last choice that was accepted.
                async sender(choice) {
                    const r = await ctx.sender(choice);
                    if (!r) {
                        lastChoice = choice;
                    }
                    return r;
                },
            },
            ...args,
        );

        // Emit final experience at the end of the game.
        emitExperience(ctx.state, true /*done*/);
        return result;
    };
}
