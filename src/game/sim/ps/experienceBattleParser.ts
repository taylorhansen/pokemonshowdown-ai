import {
    BattleAgent,
    Choice,
    choiceIds,
} from "../../../psbot/handlers/battle/agent";
import {
    allocEncodedState,
    encodeState,
} from "../../../psbot/handlers/battle/ai/encoder";
import {BattleParser} from "../../../psbot/handlers/battle/parser/BattleParser";
import {ExperienceBattleAgent} from "../../experience";

/**
 * Wraps a BattleParser to track rewards/decisions and emit Experience objects.
 *
 * Returned wrapper requires an {@link ExperienceAgent}.
 *
 * @template TArgs Parser arguments.
 * @template TResult Parser return type.
 * @param parser Parser function to wrap.
 * @param callback Callback for processing the final state transition.
 * @param username Client's username to parse game-over reward.
 * @param maxTurns Configured turn limit.
 * @returns The wrapped BattleParser function.
 */
export function experienceBattleParser<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
>(
    parser: BattleParser<BattleAgent, TArgs, TResult>,
    callback: (
        state?: Float32Array[],
        action?: number,
        reward?: number,
    ) => Promise<void>,
    username: string,
    maxTurns?: number,
): BattleParser<ExperienceBattleAgent, TArgs, TResult> {
    return async function experienceBattleParserImpl(ctx, ...args: TArgs) {
        let forcedGameOver = false;
        let lastChoice: Choice | null = null;
        let reward = 0;
        const result = await parser(
            {
                ...ctx,
                // Extract additional info from the ExperienceAgent.
                async agent(state, choices, logger) {
                    const lastAction = lastChoice
                        ? choiceIds[lastChoice]
                        : undefined;
                    lastChoice = null;
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
                iter: {
                    ...ctx.iter,
                    async next() {
                        // Observe events before the parser consumes them.
                        const r = await ctx.iter.next();
                        if (r.done) {
                            return r;
                        }
                        switch (r.value.args[0]) {
                            case "turn":
                                if (
                                    maxTurns !== undefined &&
                                    Number(r.value.args[1]) > maxTurns
                                ) {
                                    forcedGameOver = true;
                                }
                                break;
                            case "win":
                                // Add win/loss reward.
                                reward += r.value.args[1] === username ? 1 : -1;
                                break;
                            default:
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
        if (lastChoice && !forcedGameOver) {
            const stateData = allocEncodedState();
            encodeState(stateData, ctx.state);
            const lastAction = choiceIds[lastChoice];
            ctx.logger.debug(`Finalizing experience: reward = ${reward}`);
            await callback(stateData, lastAction, reward);
        } else {
            // Game result was forced, so the previous experience was actually
            // the final one.
            ctx.logger.debug("Finalizing experience: forced game over");
            await callback();
        }
        return result;
    };
}
