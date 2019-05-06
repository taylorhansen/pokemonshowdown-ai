import { BattleAgent } from "../../../src/battle/agent/BattleAgent";
import { Choice } from "../../../src/battle/agent/Choice";
import { BattleState } from "../../../src/battle/state/BattleState";
import { Pokemon } from "../../../src/battle/state/Pokemon";

/** Mocks the BattleAgent interface. */
export class MockBattleAgent implements BattleAgent
{
    /** @override */
    public acceptChoice(choice: Choice): void {}

    /** @override */
    public decide(state: BattleState, choices: Choice[]): Promise<Choice[]>
    {
        return Promise.resolve(choices);
    }

    /** @override */
    public onFaint(mon: Pokemon): void {}

    /** @override */
    public onTurn(): void {}
}
