import { Battle } from "../../../src/bot/battle/Battle";
import { Choice } from "../../../src/bot/battle/Choice";
import { Side } from "../../../src/bot/battle/state/BattleState";
import { PlayerID } from "../../../src/bot/messageData";

/** Mocks the Battle class to get access to certain fields. */
export class MockBattle extends Battle
{
    /** @override */
    public async decide(state: number[], choices: Choice[], reward: number):
        Promise<Choice>
    {
        return choices[0];
    }

    /** @override */
    public async save(): Promise<void>
    {
    }

    /**
     * Exposes Battle.getSide.
     * @override
     */
    public getSide(id: PlayerID): Side
    {
        return super.getSide(id);
    }
}
