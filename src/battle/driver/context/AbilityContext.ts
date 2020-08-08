import { Logger } from "../../../Logger";
import { isWeatherType, WeatherType } from "../../dex/dex-util";
import { BattleState } from "../../state/BattleState";
import { Pokemon } from "../../state/Pokemon";
import { ActivateAbility, AnyDriverEvent } from "../DriverEvent";
import { ContextResult, DriverContext } from "./DriverContext";

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
    constructor(state: BattleState, event: ActivateAbility, logger: Logger)
    {
        super(state, logger);

        this.mon = this.state.teams[event.monRef].active;
        this.abilityName = event.ability;

        // inference
        // override current ability with the new one
        this.mon.traits.setAbility(this.abilityName);
    }

    /** @override */
    public handle(event: AnyDriverEvent): ContextResult | DriverContext
    {
        switch (event.type)
        {
            case "activateFieldEffect":
                // see if the weather can be caused by the current ability
                if (isWeatherType(event.effect) &&
                    AbilityContext.weatherAbilities[event.effect] ===
                        this.abilityName)
                {
                    // fill in infinite duration (gen3-4) and/or source
                    this.state.status.weather.start(this.mon,
                        event.effect, /*infinite*/true);
                    return "stop";
                }
                // fallthrough
            default:
                // if this is an event we're not expecting to do anything
                //  special with, this context can be closed
                return "expire";
        }
    }
}
