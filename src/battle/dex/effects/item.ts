import * as dexutil from "../dex-util"
import * as effects from "./effects";

/** Item effect interface. */
export type Item = ItemBase & effects.PercentDamage;

/** Base interface for ItemEffects. */
interface ItemBase
{
    /** Category of item effect. */
    readonly ctg: Category;
    /** Effect should activate if the holder has this type. */
    readonly restrictType?: dexutil.Type;
    /** Effect should not activate if the holder has this type. */
    readonly noRestrictType?: dexutil.Type;
}

 // tslint:disable: no-trailing-whitespace
/**
 * Categories of item effects. Determines who receives the effect and when it
 * happens.  
 * `"selfDamageMove"` - The holder after damaging an opponent using a move.  
 * `"turn"` - The holder at the end of the turn.
 */
 // tslint:enable: no-trailing-whitespace
export type Category = "selfDamageMove" | "turn";
