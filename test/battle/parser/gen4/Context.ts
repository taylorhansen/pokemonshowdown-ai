import { BattleAgent } from "../../../../src/battle/agent/BattleAgent";
import { ChoiceSender, ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { BattleState } from "../../../../src/battle/state/BattleState";

export interface Context
{
    readonly state: BattleState;
    readonly pstate: ParserState;
    readonly parser: SubParser;
}
