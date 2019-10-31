import { BattleAgent } from "../../../src/battle/agent/BattleAgent";
import { Choice } from "../../../src/battle/agent/Choice";
import { BattleState } from "../../../src/battle/state/BattleState";

/** Mocks the BattleAgent interface. */
export class MockBattleAgent implements BattleAgent
{
    /** @override */
    public async decide(state: BattleState, choices: Choice[]): Promise<void> {}
}
