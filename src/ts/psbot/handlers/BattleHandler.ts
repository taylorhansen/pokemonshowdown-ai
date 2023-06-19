import {BattleDriver} from "../../battle/BattleDriver";
import {BattleAgent} from "../../battle/agent";
import {Event} from "../../protocol/Event";
import {RoomHandler} from "./RoomHandler";

/**
 * Base handler for battle rooms.
 *
 * @template TAgent Battle agent type.
 * @template TResult Parser result type.
 */
export class BattleHandler<
    TAgent extends BattleAgent = BattleAgent,
    TResult = unknown,
> implements RoomHandler
{
    /** Creates a BattleHandler. */
    public constructor(
        private readonly driver: BattleDriver<TAgent, TResult>,
    ) {}

    /** @override */
    public async handle(event: Event): Promise<void> {
        return await this.driver.handle(event);
    }

    /** @override */
    public halt(): void {
        return this.driver.halt();
    }
}
