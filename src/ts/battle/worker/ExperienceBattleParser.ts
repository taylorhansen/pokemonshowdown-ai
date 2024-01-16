import {Event} from "../../protocol/Event";
import {Logger} from "../../utils/logging/Logger";
import {BattleAgent, Action} from "../agent";
import {
    ActionExecutor,
    BattleParser,
    BattleParserContext,
} from "../parser/BattleParser";
import * as rewards from "./rewards";

/** BattleAgent that takes additional info for experience generation. */
export type ExperienceBattleAgent<TInfo = unknown> = BattleAgent<
    TInfo,
    [lastAction?: Action, reward?: number]
>;

/** Result from parsing and extracting experience info. */
export interface ExperienceBattleParserResult {
    /** Final action. Not provided if the game was truncated. */
    action?: Action;
    /** Final reward. Not provided if the game was truncated. */
    reward?: number;
    /** Whether the battle properly ended in a win, loss, or tie. */
    terminated?: boolean;
}

/**
 * Enforces {@link ExperienceBattleAgent} when using an
 * {@link ExperienceBattleParser}.
 */
export type ExperienceBattleParserContext =
    BattleParserContext<ExperienceBattleAgent>;

/**
 * Wraps a BattleParser to track rewards/decisions and emit experience data.
 *
 * Parser implementation requires an {@link ExperienceBattleAgent}.
 */
export class ExperienceBattleParser {
    private action: Action | undefined;
    private reward = 0;
    private terminated = false;

    /**
     * Creates an ExperienceBattleParser.
     *
     * @param parser Parser function to wrap.
     * @param username Client's username to parse game-over reward.
     */
    public constructor(
        private readonly parser: BattleParser,
        private readonly username: string,
    ) {}

    /** {@link BattleParser} implementation. */
    public async parse(
        ctx: ExperienceBattleParserContext,
        event: Event,
    ): Promise<void> {
        await this.parser(
            {
                ...ctx,
                agent: this.overrideAgent(ctx.agent),
                executor: this.overrideExecutor(ctx.executor),
            },
            event,
        );
        switch (event.args[0]) {
            case "win":
                // Add win/loss reward.
                this.reward +=
                    event.args[1] === this.username
                        ? rewards.win
                        : rewards.lose;
                this.terminated = true;
                break;
            case "tie":
                this.reward += rewards.tie;
                this.terminated = true;
                break;
            default:
        }
    }

    /** Collects final experience data. */
    public finish(logger?: Logger): ExperienceBattleParserResult {
        if (!this.terminated) {
            // Game was truncated due to max turn limit or error.
            logger?.debug("Truncated, no final reward");
            return {};
        }
        logger?.debug(`Final reward = ${this.reward}`);
        return {action: this.action, reward: this.reward, terminated: true};
    }

    private overrideAgent(agent: ExperienceBattleAgent): BattleAgent {
        return async (state, choices, logger) => {
            // Provide additional info to the ExperienceAgent.
            const lastAction = this.action;
            this.action = undefined;
            const lastReward = this.reward;
            this.reward = 0;
            logger?.debug(`Reward = ${lastReward}`);
            return await agent(state, choices, logger, lastAction, lastReward);
        };
    }

    private overrideExecutor(executor: ActionExecutor): ActionExecutor {
        return async choice => {
            const r = await executor(choice);
            if (!r) {
                // Extract the last choice that was accepted.
                this.action = choice;
            }
            return r;
        };
    }
}
