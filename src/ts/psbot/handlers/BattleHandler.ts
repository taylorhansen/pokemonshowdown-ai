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
export class BattleHandler<TAgent extends BattleAgent = BattleAgent>
    implements RoomHandler
{
    /** Creates a BattleHandler. */
    public constructor(private readonly driver: BattleDriver<TAgent>) {}

    /** @override */
    public async handle(event: Event): Promise<void> {
        await this.driver.handle(event);
    }

    /** @override */
    public halt(): void {
        this.driver.halt();
    }

    /** @override */
    public finish(): void {
        this.driver.finish();
    }
}
