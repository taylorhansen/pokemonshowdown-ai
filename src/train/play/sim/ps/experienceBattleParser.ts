import {formats} from "../../../../psbot/handlers/battle";
import {
    BattleAgent,
    Choice,
    choiceIds,
} from "../../../../psbot/handlers/battle/agent";
import {
    BattleParser,
    BattleParserContext,
} from "../../../../psbot/handlers/battle/parser";
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
 * @template T Game format type.
 * @template TArgs Parser arguments.
 * @template TResult Parser return type.
 * @param parser Parser function to wrap.
 * @param callback Callback for emitting Experience objs.
 * @param username Client's username to parse game-over reward.
 * @returns The wrapped BattleParser function.
 */
export function experienceBattleParser<
    T extends formats.FormatType = formats.FormatType,
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    parser: BattleParser<T, BattleAgent<T>, TArgs, TResult>,
    callback: (exp: Experience) => void,
    username: string,
): BattleParser<T, ExperienceAgent<T>, TArgs, TResult> {
    return async function _experienceBattleParser(
        ctx: BattleParserContext<T, ExperienceAgent<T>>,
        ...args: TArgs
    ): Promise<TResult> {
        let expAgentData: ExperienceAgentData | null = null;
        let lastChoice: Choice | null = null;
        let reward = 0;
        function emitExperience() {
            if (!expAgentData || !lastChoice) {
                return;
            }
            // Collect data to emit an experience.
            const action = choiceIds[lastChoice];
            ctx.logger.debug(`Emitting experience, reward=${reward}`);
            callback({...expAgentData, action, reward});
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
                    emitExperience();
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
        // FIXME: In startPSBattle(), forcing a tie after reaching maxTurns will
        // cause an extra Experience to be emitted between the last decision and
        // the |tie event.
        emitExperience();
        return result;
    };
}
