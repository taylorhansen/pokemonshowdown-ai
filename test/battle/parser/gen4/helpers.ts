import { expect } from "chai";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { SubParser } from
    "../../../../src/battle/parser/BattleParser";

export function createParserHelpers(parser: () => SubParser)
{
    const result = {
        async handle(event: events.Any): Promise<void>
        {
            const r = await parser().next(event);
            expect(r.value).to.not.be.ok;
            expect(r.done).to.not.be.ok;
        },
        async reject(event: events.Any): Promise<void>
        {
            return expect(parser().next(event))
                .to.eventually.become({value: event, done: true});
        },
        exitParser(): Promise<void>
        {
            return result.reject({type: "halt", reason: "decide"});
        }
    } as const;
    return result;
}
