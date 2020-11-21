import { expect } from "chai";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { SubParser, SubParserResult } from
    "../../../../src/battle/parser/BattleParser";

export function createParserHelpers(parser: () => SubParser)
{
    const result = {
        async handle(event: events.Any): Promise<void>
        {
            return expect(parser().next(event))
                .to.eventually.become({value: undefined, done: false});
        },
        async handleEnd<TResult = SubParserResult>(event: events.Any,
            baseResult?: TResult): Promise<void>
        {
            return expect(parser().next(event))
                .to.eventually.become({value: {...baseResult}, done: true});
        },
        async reject<TResult = SubParserResult>(event: events.Any,
            baseResult?: TResult): Promise<void>
        {
            return result.handleEnd(event, {...baseResult, event});
        },
        exitParser<TResult = SubParserResult>(baseResult?: TResult):
            Promise<void>
        {
            return result.reject({type: "halt", reason: "decide"}, baseResult);
        }
    } as const;
    return result;
}
