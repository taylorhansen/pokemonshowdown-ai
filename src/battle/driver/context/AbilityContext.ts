import { Logger } from "../../../Logger";
import * as dex from "../../dex/dex";
import { AbilityData, isWeatherType, MoveData, WeatherType } from
    "../../dex/dex-util";
import * as effects from "../../dex/effects";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import { Side } from "../../state/Side";
import * as events from "../BattleEvent";
import { ContextResult, DriverContext } from "./context";
import { PendingEffects } from "./effect/PendingEffects";
import { PendingPercentEffect } from "./effect/PendingPercentEffect";
import { PendingValueEffect } from "./effect/PendingValueEffect";
import { Gen4Context } from "./Gen4Context";

/** Handles events related to an ability. Rejects unrelated events. */
export class AbilityContext extends DriverContext
{
    // TODO: move to dex ability effects
    /** Maps weather type to the ability that can cause it. */
    private static readonly weatherAbilities:
        {readonly [T in WeatherType]: string} =
    {
        Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
        SunnyDay: "drought"
    }

    /** Base context for handling events. */
    private readonly base = new Gen4Context(this.state, this.logger);

    // TODO: track other On types, then remove null union w/on param
    /**
     * Constructs an AbilityContext.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     * @param on Context in which the ability is activating.
     * @param hitByMove Move that the pokemon was just hit by, if applicable.
     * @returns An AbilityContext, or false if not appropriate for this context.
     */
    public static from(state: BattleState, event: events.ActivateAbility,
        logger: Logger, on: effects.ability.On | null, hitByMove?: string):
        AbilityContext
    {
        if (!dex.abilities.hasOwnProperty(event.ability))
        {
            throw new Error(`Unknown ability '${event.ability}'`);
        }
        const monRef = event.monRef;
        const mon = state.teams[monRef].active;
        const data = dex.abilities[event.ability];

        let hitBy: MoveData | undefined;
        if (hitByMove && dex.moves.hasOwnProperty(hitByMove))
        {
            hitBy = dex.moves[hitByMove]
        }

        // add pending effects
        const pendingEffects = new PendingEffects();
        for (const ctg of Object.keys(data.effects ?? {}) as
            effects.ability.On[])
        {
            // let specific categories also count as less specific ones
            let invalid = false;
            switch (on)
            {
                case "contactKO":
                    if (ctg === "contactKO") break;
                    // fallthrough
                case "contact":
                    if (ctg === "contact") break;
                    // fallthrough
                case "damaged":
                    if (ctg === "damaged") break;
                    // fallthrough
                default:
                    invalid = true;
            }
            if (invalid) continue;

            for (const effect of data.effects![ctg]!)
            {
                const baseName = `${data.name} on-${ctg} ${effect.tgt}`;

                if (effect.tgt === "self")
                {
                    // if the ability is activating due to a ko, we shouldn't
                    //  expect any self-effects from activating
                    // TODO: when is this not the case?
                    if (ctg === "contactKO")
                    {
                        throw new Error(`Effect '${baseName}' can't activate`);
                    }
                    if (on === "contactKO") continue;
                }

                switch (effect.type)
                {
                    case "chance":
                    {
                        const name = baseName + " status";
                        for (const innerEffect of effect.effects)
                        {
                            pendingEffects.add(name,
                                new PendingValueEffect(innerEffect.value),
                                "alt");
                        }
                        break;
                    }
                    case "percentDamage":
                        pendingEffects.add(baseName + " percentDamage",
                            new PendingPercentEffect(effect.value), "assert");
                        break;
                    case "status": case "typeChange":
                        pendingEffects.add(baseName + " " + effect.type,
                            new PendingValueEffect(effect.value), "assert");
                        break;
                    default:
                        // should never happen
                        throw new Error("Unknown Ability effect type " +
                            `'${effect!.type}'`);
                }
            }
        }

        return new AbilityContext(state, logger, mon, monRef, data, on,
            pendingEffects, hitBy);
    }

    /**
     * Constructs an AbilityContext.
     * @param state State object to mutate while handling events.
     * @param logger Logger object.
     * @param mon Pokemon with the ability.
     * @param monRef Reference to mon.
     * @param data Ability data.
     * @param on Context in which the ability is activating.
     * @param pendingEffects Effect container.
     * @param hitBy Move that the pokemon was just hit by, if applicable.
     */
    private constructor(state: BattleState, logger: Logger,
        private readonly mon: Pokemon, private readonly monRef: Side,
        private readonly data: AbilityData,
        private readonly on: effects.ability.On | null,
        private readonly pendingEffects: PendingEffects,
        private readonly hitBy?: MoveData)
    {
        super(state, logger);
        mon.traits.setAbility(data.name);
    }

    /** @override */
    public expire(): void
    {
        // all pending effects must be accounted for
        this.pendingEffects.assert();
        super.expire();
    }

    // TODO: handle other ability effects

    /** @override */
    public activateFieldEffect(event: events.ActivateFieldEffect): ContextResult
    {
        // see if the weather can be caused by the current ability
        if (isWeatherType(event.effect) &&
            AbilityContext.weatherAbilities[event.effect] === this.data.name)
        {
            // fill in infinite duration (gen3-4) and/or source
            this.state.status.weather.start(this.mon,
                event.effect, /*infinite*/true);
            return true;
        }
    }

    /** @override */
    public activateStatusEffect(event: events.ActivateStatusEffect):
        ContextResult
    {
        const tgt: effects.ability.Target = event.monRef === this.monRef ?
            "self" : "hit";
        const name = `${this.data.name} on-${this.on} ${tgt} status`;

        return event.start && this.pendingEffects.consume(name, event.effect) &&
            this.base.activateStatusEffect(event);
    }

    /** @override */
    public changeType(event: events.ChangeType): ContextResult
    {
        const tgt: effects.ability.Target = event.monRef === this.monRef ?
            "self" : "hit";
        const name = `${this.data.name} on-${this.on} ${tgt} typeChange`;

        return event.newTypes[1] === "???" &&
            this.hitBy?.type === event.newTypes[0] &&
            this.pendingEffects.consume(name, "colorchange") &&
            this.base.changeType(event);
    }

    /** @override */
    public takeDamage(event: events.TakeDamage): ContextResult
    {
        const tgt: effects.ability.Target = event.monRef === this.monRef ?
            "self" : "hit";
        const name = `${this.data.name} on-${this.on} ${tgt} percentDamage`;

        const mon = this.state.teams[event.monRef].active;
        const initial = mon.hp.current;
        const next = event.newHP[0];
        const max = event.newHP[1];

        return this.pendingEffects.consume(name, initial, next, max) &&
            this.base.takeDamage(event);
    }
}
