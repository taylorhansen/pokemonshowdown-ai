import * as dexutil from "../dex/dex-util";
import * as effects from "../dex/effects";
import { BattleState } from "../state/BattleState";
import { ReadonlyPokemon } from "../state/Pokemon";
import * as events from "./BattleEvent";
import { BattleParser, BattleParserArgs, BattleParserFunc, ParserState,
    SubParser, SubParserFunc, SubParserResult } from "./BattleParser";

/** Checks whether the pokemon has the given status. */
export function hasStatus(mon: ReadonlyPokemon, statusType: effects.StatusType):
    boolean
{
    switch (statusType)
    {
        case "aquaRing": case "attract": case "curse": case "flashFire":
        case "focusEnergy": case "imprison": case "ingrain":
        case "leechSeed": case "mudSport": case "nightmare":
        case "powerTrick": case "substitute": case "suppressAbility":
        case "torment": case "waterSport":
        case "destinyBond": case "grudge": case "rage": // singlemove
        case "magicCoat": case "roost": case "snatch": // singleturn
            return mon.volatile[statusType];
        case "bide": case "confusion": case "charge": case "magnetRise":
        case "embargo": case "healBlock": case "slowStart": case "taunt":
        case "uproar": case "yawn":
            return mon.volatile[statusType].isActive;
        case "encore":
            return mon.volatile[statusType].ts.isActive;
        case "endure": case "protect": // stall
            return mon.volatile.stalling;
        case "foresight": case "miracleEye":
            return mon.volatile.identified === statusType;
        default:
            if (dexutil.isMajorStatus(statusType))
            {
                return mon.majorStatus.current === statusType;
            }
            // istanbul ignore next: should never happen
            throw new Error(`Invalid status effect '${statusType}'`);
    }
}

/**
 * Checks if the boost amounts are suitable.
 * @param set Whether the boost is being set (`true`) or added (`false`).
 * @param pending Pending boost amount.
 * @param given Given boost amount from game events.
 * @param current Pokemon's current boost amount if adding (`set`=false).
 */
export function matchBoost(set: boolean, pending: number, given: number,
    current?: number): boolean
{
    if (set) return current == null && pending === given;
    if (current == null) return false;

    const next = Math.max(-6, Math.min(given + current, 6));
    const expected = Math.max(-6, Math.min(pending + current, 6));
    return next === expected;
}

/**
 * Checks whether a percent-damage effect would be silent.
 * @param percent Percent damage.
 * @param hp Current hp.
 * @param hpMax Max hp.
 */
export function matchPercentDamage(percent: number, hp: number, hpMax: number):
    boolean
{
    // can't heal when full or damage when fainted
    return (percent > 0 && hp >= hpMax) || (percent < 0 && hp <= 0);
}

/** Maps BattleEvent type to a SubParser handler. */
export type EventHandlerMap = {readonly [T in events.Type]: EventHandler<T>};

/** Generic type for a sub-parser declaration. */
export type EventHandler<T extends events.Type, TArgs extends any[] = []> =
    SubParserFunc<[events.Event<T>, ...TArgs]>

/**
 * Creates a sub-parser that dispatches to an appropriate event handler using
 * the given map.
 */
export function baseHandler(handlers: EventHandlerMap):
    EventHandler<events.Type>
{
    return function f<T extends events.Type>(pstate: ParserState,
        event: events.Event<T>): SubParser
    {
        return (handlers[event.type] as typeof f)(pstate, event);
    }
}

/**
 * Creates a top-level BattleParser that loops a SubParser.
 * @param f Parser function to use. Must accept any BattleEvent.
 */
export function baseEventLoop(f: EventHandler<events.Type>): BattleParserFunc
{
    return async function*(args: BattleParserArgs): BattleParser
    {
        const pstate = {...args, state: new BattleState()};
        // the first yield should provide initialization info to the caller
        let event: events.Any = yield pstate.state;
        // base event loop, stopping the parser on the first truthy value which
        //  indicates a detected permanent halt
        let result: void | SubParserResult;
        while (true)
        {
            result = yield* f(pstate, event);
            // permanent halt detected, stop loop
            if (result.permHalt) break;
            // parser rejected an event
            if (result.event)
            {
                // event handler rejected the event it was initially given
                if (result.event === event)
                {
                    throw new Error("BattleParser rejected an event: " +
                        `'${JSON.stringify(event)}'`);
                }
                event = result.event;
            }
            // continue
            else event = yield;
        }
    };
}

/**
 * Creates a sub-parser event loop within a SubParser context.
 * @param f Event handler function. This will be called on newly-yielded
 * BattleEvents until it returns a `SubParserResult` with either
 * `#permHalt=true` or `#event` equalling the event it was given.
 * @param lastEvent Event to be used as a replacement for the first yield.
 */
export async function* eventLoop(f: (event: events.Any) => SubParser,
    lastEvent?: events.Any): SubParser
{
    let event = lastEvent ?? (yield);
    while (true)
    {
        const result = yield* f(event);
        if (result?.permHalt || result?.event === event) return result;
        event = result?.event ?? (yield);
    }
}
