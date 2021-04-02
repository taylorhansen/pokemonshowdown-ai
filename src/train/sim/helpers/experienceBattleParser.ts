import { Choice, choiceIds } from "../../../battle/agent/Choice";
import { BattleParser, BattleParserArgs, BattleParserFunc } from
    "../../../battle/parser/BattleParser";
import { ReadonlyBattleState } from "../../../battle/state/BattleState";
import { Experience, ExperienceAgent, ExperienceAgentData } from "./Experience";

/**
 * Wraps a BattleParserFunc to track reward and emit Experience objects.
 * @param parserFunc Parser function to wrap.
 * @param callback Callback for emitting Experience objs.
 */
export function experienceBattleParser(parserFunc: BattleParserFunc,
    callback: (exp: Experience) => void):
    BattleParserFunc<BattleParserArgs<ExperienceAgent>>
{
    return async function*(args: BattleParserArgs<ExperienceAgent>):
        BattleParser
    {
        let lastChoice: Choice | null = null as any;
        let expAgentData: ExperienceAgentData | null = null as any;
        const innerParser = parserFunc(
        {
            logger: args.logger,
            // extract additional info from the ExperienceAgent
            agent: async (state, choices, logger) =>
                expAgentData = await args.agent(state, choices, logger),
            // extract the last choice that was accepted
            async sender(choice)
            {
                const result = await args.sender(choice);
                if (!result) lastChoice = choice;
                return result;
            }
        });

        // first yield should be the battlestate ref
        const rbs = (await innerParser.next()).value as ReadonlyBattleState;
        let event = yield rbs;

        // track reward value
        let reward = 0;
        while (!(await innerParser.next(event)).done)
        {
            event = yield;

            // process event before the wrapped parser handles it

            if (event.type === "halt" && event.reason !== "wait")
            {
                // add win/loss reward
                if (event.reason === "gameOver")
                {
                    reward += event.winner === "us" ? 1 : -1;
                }

                // process accumulated reward and emit an Experience
                if (expAgentData && lastChoice)
                {
                    const data = expAgentData;
                    const action = choiceIds[lastChoice];
                    expAgentData = null;
                    lastChoice = null;
                    args.logger.debug(`Emitting experience, reward=${reward}`);
                    callback({...data, action, reward});
                }
                reward = 0;
            }
        }
        // pass return value
        return yield* innerParser;
    };
}
