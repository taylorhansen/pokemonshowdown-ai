import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import * as dexutil from "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ContextResult, DriverContext } from "./DriverContext";
import { PendingEffects } from "./effect/PendingEffects";
import { PendingPercentEffect } from "./effect/PendingPercentEffect";
import { Gen4Context } from "./Gen4Context";

/** Handles events related to an item. Rejects unrelated events. */
export class ItemContext extends DriverContext
{
    /** Base context for handling events. */
    private readonly base = new Gen4Context(this.state, this.logger);

    /**
     * Constructs an ItemContext if we're in a valid context for the item.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     * @param ctg Context surrounding item activation.
     */
    public static from(state: BattleState, event: events.ActivateItem,
        logger: Logger, ctg: effects.item.Category): ContextResult
    {
        if (event.item === "none" || !dex.items.hasOwnProperty(event.item))
        {
            throw new Error(`Unknown item '${event.item}'`);
        }
        const holder = state.teams[event.monRef].active;
        const holderRef = event.monRef;
        const data = dex.items[event.item];

        const pendingEffects = new PendingEffects();
        for (const effect of data.effects ?? [])
        {
            // wrong context to activate this item in
            // TODO: any reason to not reject?
            if (effect.ctg !== ctg) return;
            // evaluate type restrictions
            if (effect.restrictType &&
                !holder.types.includes(effect.restrictType))
            {
                continue;
            }
            if (effect.noRestrictType &&
                holder.types.includes(effect.noRestrictType))
            {
                continue;
            }

            const effectString = `${data.name} ${effect.type} ${effect.ctg}` +
                (effect.restrictType ? ` only-${effect.restrictType}` : "") +
                (effect.noRestrictType ? ` no-${effect.noRestrictType}` : "");

            switch (effect.type)
            {
                case "percentDamage":
                    pendingEffects.add(effectString,
                        new PendingPercentEffect(effect.value),
                            "assert");
                    break;
                default:
                    // should never happen
                    throw new Error("Unknown Item effect type " +
                        `'${effect!.type}'`);
            }
        }

        return new ItemContext(state, logger, holder, holderRef, data, ctg,
            pendingEffects);
    }

    /**
     * Constructs an ItemContext.
     * @param state State object to mutate while handling events.
     * @param logger Logger object.
     * @param holder Holder of the item.
     * @param holderRef Reference to holder.
     * @param data Item data.
     * @param ctg Context surrounding item activation.
     * @param pendingEffects Effect container.
     */
    private constructor(state: BattleState, logger: Logger,
        private readonly holder: Pokemon,
        private readonly holderRef: Side,
        private readonly data: dexutil.ItemData,
        private readonly ctg: effects.item.Category,
        private readonly pendingEffects: PendingEffects)
    {
        super(state, logger);
        holder.setItem(data.name);
    }

    /** @override */
    public expire(): void
    {
        // all pending effects must be accounted for
        this.pendingEffects.assert();
        super.expire();
    }

    /** @override */
    public takeDamage(event: events.TakeDamage): ContextResult
    {
        let mon: Pokemon;
        switch (this.ctg)
        {
            case "selfDamageMove": case "turn":
                if (this.holderRef !== event.monRef) return;
                mon = this.holder;
                break;
            default: return;
        }
        const initial = mon.hp.current;
        const next = event.newHP[0];
        const max = event.newHP[1];

        // check base effect name
        const baseEffectString = `${this.data.name} percentDamage ${this.ctg}`;
        if (this.pendingEffects.consume(baseEffectString, initial, next, max))
        {
            return this.base.takeDamage(event);
        }

        // check restrictType
        for (const type of mon.types)
        {
            const effectString = baseEffectString + ` only-${type}`;
            if (this.pendingEffects.consume(effectString, initial, next, max))
            {
                return this.base.takeDamage(event);
            }
        }

        // check noRestrictType
        for (const type of dexutil.typeKeys.filter(t => !mon.types.includes(t)))
        {
            const effectString = baseEffectString + ` no-${type}`;
            if (this.pendingEffects.consume(effectString, initial, next, max))
            {
                return this.base.takeDamage(event);
            }
        }

        return super.takeDamage(event);
    }
}
