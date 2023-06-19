import {BattleAgent, Action} from "../agent";
import {BattleParser} from "../parser/BattleParser";
import * as rewards from "./rewards";

/**
 * Typing for experience-tracking battle parser.
 *
 * @template TArgs Wrapped parser args.
 * @template TResult Wrapped parser result.
 */
export type ExperienceBattleParser<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = BattleParser<
    ExperienceBattleAgent,
    TArgs,
    ExperienceBattleParserResult<TResult>
>;

/** BattleAgent that takes additional info for experience generation. */
export type ExperienceBattleAgent<TInfo = unknown> = BattleAgent<
    TInfo,
    [lastAction?: Action, reward?: number]
>;

/**
 * Result from parsing and extracting experience info.
 *
 * @template TResult Result of wrapped parser.
 */
export interface ExperienceBattleParserResult<TResult = unknown> {
    /** Result of wrapped parser. */
    result: TResult;
    /** Final action. Not provided if the game was truncated. */
    action?: Action;
    /** Final reward. Not provided if the game was truncated. */
    reward?: number;
    /** Whether the battle properly ended in a win, loss, or tie. */
    terminated?: boolean;
}

/**
 * Wraps a BattleParser to track rewards/decisions and emit experience data.
 *
 * Returned wrapper requires an {@link ExperienceBattleAgent}.
 *
 * @template TArgs Parser arguments.
 * @template TResult Parser return type.
 * @param parser Parser function to wrap.
 * @param username Client's username to parse game-over reward.
 * @returns The wrapped BattleParser function.
 */
export function experienceBattleParser<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    parser: BattleParser<BattleAgent, TArgs, TResult>,
    username: string,
): ExperienceBattleParser<TArgs, TResult> {
    return async function experienceBattleParserImpl(ctx, ...args: TArgs) {
        let action: Action | undefined;
        let reward = 0;
        let terminated = false;
        const result = await parser(
            {
                ...ctx,
                // Provide additional info to the ExperienceAgent.
                async agent(state, choices, logger) {
                    const lastAction = action;
                    action = undefined;
                    const lastReward = reward;
                    reward = 0;
                    ctx.logger.debug(`Reward = ${lastReward}`);
                    return await ctx.agent(
                        state,
                        choices,
                        logger,
                        lastAction,
                        lastReward,
                    );
                },
                // Override event iterator for reward tracking.
                iter: {
                    ...ctx.iter,
                    async next() {
                        // Observe events before the parser consumes them.
                        const r = await ctx.iter.next();
                        if (r.done) {
                            return r;
                        }
                        switch (r.value.args[0]) {
                            case "win":
                                // Add win/loss reward.
                                reward +=
                                    r.value.args[1] === username
                                        ? rewards.win
                                        : rewards.lose;
                                terminated = true;
                                break;
                            case "tie":
                                reward += rewards.tie;
                                terminated = true;
                                break;
                            default:
                        }
                        return r;
                    },
                },
                async executor(choice) {
                    const r = await ctx.executor(choice);
                    if (!r) {
                        // Extract the last choice that was accepted.
                        action = choice;
                    }
                    return r;
                },
            },
            ...args,
        );
        if (!terminated) {
            // Game was truncated due to max turn limit or error.
            return {result};
        }
        ctx.logger.debug(`Final reward = ${reward}`);
        return {result, action, reward, terminated: true};
    };
}
