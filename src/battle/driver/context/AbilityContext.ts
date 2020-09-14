import { Logger } from "../../../Logger";
import { isWeatherType, WeatherType } from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import * as events from "../BattleEvent";
import { ContextResult, DriverContext } from "./context";

/** Handles events related to an ability. */
export class AbilityContext extends DriverContext
{
    /** Maps weather type to the ability that can cause it. */
    private static readonly weatherAbilities: {[T in WeatherType]: string} =
    {
        Hail: "snowwarning", RainDance: "drizzle", Sandstorm: "sandstream",
        SunnyDay: "drought"
    }

    // event data
    /** Pokemon whose ability was activated. */
    private readonly mon: Pokemon;
    /** Ability being activated. */
    private readonly abilityName: string;

    /**
     * Constructs an AbilityContext.
     * @param state State object to mutate while handling events.
     * @param event Event that started this context.
     * @param logger Logger object.
     */
    constructor(state: BattleState, event: events.ActivateAbility,
        logger: Logger)
    {
        super(state, logger);

        this.mon = this.state.teams[event.monRef].active;
        this.abilityName = event.ability;

        // inference
        // override current ability with the new one
        this.mon.traits.setAbility(this.abilityName);
    }

    // TODO: handle ability effects
    /** @override */
    public handle(event: events.Any): ContextResult
    {
        if (event.type !== "activateFieldEffect") return;
        return super.handle(event);
    }

    /** @override */
    public activateFieldEffect(event: events.ActivateFieldEffect): ContextResult
    {
        // see if the weather can be caused by the current ability
        if (isWeatherType(event.effect) &&
            AbilityContext.weatherAbilities[event.effect] === this.abilityName)
        {
            // fill in infinite duration (gen3-4) and/or source
            this.state.status.weather.start(this.mon,
                event.effect, /*infinite*/true);
            return super.activateFieldEffect(event);
        }
    }
}
