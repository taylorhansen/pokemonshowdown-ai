import {Event} from "../../../../../../parser";
import {BattleParserContext, consume, tryVerify} from "../../../../parser";
import * as dex from "../../dex";
import {Pokemon} from "../../state/Pokemon";

/**
 * Expects a weather effect.
 *
 * @param source Pokemon source of effect.
 * @param type Type of weather to start, or `"none"` to end current weather.
 * @param pred Optional additional custom check on the event before it can be
 * parsed. If it returns `false` then the event won't be parsed. If it returns
 * a truthy value then the event is accepted and the weather is set, with a
 * return value of `"infinite"` indicating infinite weather duration.
 * @returns `true` if the effect was parsed, `"silent"` if the effect is a
 * no-op, or `undefined` if the effect wasn't parsed.
 */
export async function weather(
    ctx: BattleParserContext<"gen4">,
    source: Pokemon | null,
    type: dex.WeatherType | "none",
    pred?: (event: Event<"|-weather|">) => boolean | "infinite",
): Promise<true | "silent" | undefined> {
    const rs = ctx.state.status;
    // Effect would do nothing.
    if (rs.weather.isActive === (type !== "none")) return "silent";

    // Parse event.
    const event = await tryVerify(ctx, "|-weather|");
    if (!event) return;
    if (event.kwArgs.upkeep) return;
    const [, weatherStr] = event.args;
    if (weatherStr !== type) return;
    const predRes = pred?.(event);
    if (predRes === false) return;

    // Note that this is the base implementation for a weather-starting event,
    // factored out here in order to be able to take additional parameters.
    ctx.state.status.weather.start(
        source,
        weatherStr as dex.WeatherType | "none",
        predRes === "infinite" /*infinite*/,
    );
    await consume(ctx);
    return true;
}
