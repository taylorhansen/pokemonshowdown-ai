import { AI } from "../../../../src/bot/battle/ai/AI";
import { Choice } from "../../../../src/bot/battle/ai/Choice";

/** Mocks the AI interface. */
export class MockAI implements AI
{
    constructor(inputLength: number)
    {
    }

    /** @override */
    public async decide(state: number[], choices: Choice[], reward?: number):
        Promise<Choice>
    {
        return choices[0];
    }

    /** @override */
    public async save(): Promise<void>
    {
    }
}
