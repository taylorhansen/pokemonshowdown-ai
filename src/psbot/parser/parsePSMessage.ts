/** @file Exposes the `parsePSMessage` function. */
import { BoostName, boostNames } from "../../battle/dex/dex-util";
import { Logger } from "../../Logger";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BattleEventPrefix,
    BoostEvent, CantEvent, Cause, ClearAllBoostEvent, ClearBoostEvent,
    ClearNegativeBoostEvent, ClearPositiveBoostEvent, CopyBoostEvent,
    CureStatusEvent, CureTeamEvent, DamageEvent,
    DetailsChangeEvent, EndAbilityEvent, EndEvent, FaintEvent, FieldEndEvent,
    FieldStartEvent, FormeChangeEvent, InvertBoostEvent, isBattleEventPrefix,
    MoveEvent, MustRechargeEvent, PrepareEvent, SetBoostEvent, SetHPEvent,
    SideEndEvent, SideStartEvent, SingleTurnEvent, StartEvent, StatusEvent,
    SwapBoostEvent, SwitchEvent, TieEvent, TurnEvent, UnboostEvent, UpkeepEvent,
    WeatherEvent, WinEvent } from "../dispatcher/BattleEvent";
import { BattleInitMessage, MajorPrefix } from "../dispatcher/Message";
import { MessageListener } from "../dispatcher/MessageListener";
import { PlayerID } from "../helpers";
import { chain, many, maybe, sequence, transform } from "./combinators";
import { anyWord, boostName, dispatch, integer, json, majorStatus,
    parseBoostName, parsePokemonDetails, parsePokemonID, parsePokemonStatus,
    playerId, playerIdWithName, pokemonDetails, pokemonId, pokemonStatus,
    restOfLine, skipLine, weatherType, word } from "./helpers";
import { iter } from "./Iter";
import { Info, Input, Parser, Result } from "./types";

/**
 * Parses a message from a PokemonShowdown server.
 * @param data Message(s) to be parsed.
 * @param listener What to do for each message type.
 * @param logger Logs messages to the user.
 */
export function parsePSMessage(data: string, listener: MessageListener,
    logger = Logger.stderr): Promise<void>
{
    const {room, pos} = parseRoom(data);
    const info: Info = {room, listener, logger};

    // remove room line
    if (pos > 0) data = data.substr(pos);
    // words are separated by pipe characters so they don't need to be there
    // lines are separated by newlines so leave them in using lookahead
    // e.g. "|a|b\n|c|d" becomes ["", "a", "b", "\n", "c", "d"]
    const words = data.split(/\||(?=\n)/);
    // remove initial blank space
    words.shift();

    const input = iter(words);

    return messages(input, info);
}

/**
 * Parses room name.
 * @param data Message string.
 * @returns The room name and the position of the first line. Defaults to empty
 * string if no room name was found.
 */
function parseRoom(data: string): {room: string, pos: number}
{
    // format: >roomname
    if (data.startsWith(">"))
    {
        let pos = data.indexOf("\n", 1);
        // istanbul ignore if: can't test
        if (pos === -1) pos = data.length;
        return {room: data.substring(1, pos), pos: pos + 1};
    }
    // no room name found
    return {room: "", pos: 0};
}

/** Parses messages until the input is consumed. */
async function messages(input: Input, info: Info): Promise<void>
{
    const promises: Promise<void>[] = [];
    while (!input.done)
    {
        // the parser doesn't have to consume the whole line since the rest of
        //  it will be skipped over
        try
        {
            const r = message(input, info);
            promises.push(r.result);
            input = r.remaining;
        }
        catch (e) { info.logger.error(e); }

        // skip until next line (after the newline)
        input = skipLine(input, info).remaining.next();
    }
    await Promise.all(promises);
}

/** Parses a Message. */
function message(input: Input, info: Info): Result<Promise<void>>
{
    const prefix = input.get() as MajorPrefix | "player" | BattleEventPrefix;

    switch (prefix)
    {
        case "challstr": return messageChallstr(input, info);
        case "deinit": return messageDeInit(input, info);
        case "error": return messageError(input, info);
        case "init": return messageInit(input, info);
        case "request": return messageRequest(input, info);
        case "updatechallenges": return messageUpdateChallenges(input, info);
        case "updateuser": return messageUpdateUser(input, info);
        case "player": return messageBattleInit(input, info);
        default:
            if (isBattleEventPrefix(prefix))
            {
                return messageBattleProgress(input, info);
            }

            // silently ignore this message line
            return {result: Promise.resolve(), remaining: input};
    }
}

// message parsers

/**
 * MessageParsers can parse one or multiple lines, and must end on or before the
 * last parsed line's newline character.
 */
type MessageParser = Parser<Promise<void>>;

/**
 * Parses a `challstr` message.
 *
 * Format:
 * @example
 * |challstr|<challstr>
 */
const messageChallstr: MessageParser = chain(
    sequence(word("challstr"), restOfLine),
    ([_, challstr]) => dispatch("challstr", {challstr}));

/**
 * Parses an `error` message.
 *
 * Format:
 * @example
 * |error|[reason] <description>
 */
const messageError: MessageParser = chain(
    sequence(word("error"), restOfLine),
    ([_, reason]) => dispatch("error", {reason}));

/**
 * Parses a `deinit` message.
 *
 * Format:
 * @example
 * |deinit
 */
const messageDeInit: MessageParser =
    chain(word("deinit"), () => dispatch("deinit", {}));

/**
 * Parses an `init` message.
 *
 * Format:
 * @example
 * |init|<chat or battle>
 */
const messageInit: MessageParser = chain(
    sequence(
        word("init"),
        transform(anyWord, type =>
        {
            if (type !== "chat" && type !== "battle")
            {
                throw new Error(`Unknown room type ${type}`);
            }
            return type;
        })),
    ([_, type]) => dispatch("init", {type}));

/**
 * Parses a `request` message. The JSON data in the RequestArgs need to have
 * their side details object further parsed before dispatch.
 *
 * Format:
 * @example
 * |request|<unparsed RequestArgs json>
 */
const messageRequest: MessageParser = chain(
    sequence(
        word("request"),
        transform(json, function(obj)
        {
            // some info is encoded in a string that needs to be further parsed
            for (const mon of obj.side.pokemon)
            {
                // ident, details, and condition fields are the same format as
                //  the data from a |switch| message
                mon.ident = parsePokemonID(mon.ident, /*pos*/false);
                mon.details = parsePokemonDetails(mon.details);
                mon.condition = parsePokemonStatus(mon.condition);
            }

            return obj;
        })),
    ([_, msg]) => dispatch("request", msg));

/**
 * Parses an `updatechallenges` message.
 *
 * Format:
 * @example
 * |updatechallenges|<UpdateChallengesArgs json>
 */
const messageUpdateChallenges: MessageParser = chain(
    sequence(word("updatechallenges"), json),
    ([_, msg]) => dispatch("updatechallenges", msg));

/**
 * Parses an `updateuser` message.
 *
 * Format:
 * @example
 * |updateuser|<our username>|<0 if guest, 1 otherwise>|<avatarId>
 */
const messageUpdateUser: MessageParser = chain(
    // TODO: include avatar id
    sequence(word("updateuser"), anyWord, integer),
    ([_, username, named]) =>
        dispatch("updateuser", {username, isGuest: !named}));

/**
 * Parses a `battleinit` multiline message.
 *
 * Format:
 * @example
 * |player|<our PlayerID>|<our username>|<avatar id>
 * |teamsize|p1|<team size>
 * |teamsize|p2|<team size>
 * |gametype|<game type>
 * |gen|<gen #>
 * <...>
 * |start
 * <initial BattleEvents>
 * |turn|1
 */
function messageBattleInit(input: Input, info: Info): Result<Promise<void>>
{
    let id: PlayerID | undefined;
    let username: string | undefined;
    let teamSizes: {[P in PlayerID]: number} | undefined;
    let gameType: string | undefined;
    let gen: number | undefined;
    const events: AnyBattleEvent[] = [];

    while (!input.done)
    {
        const prefix = input.get();
        switch (prefix)
        {
            case "player":
            {
                const r = messageBattleInitPlayer(input, info);
                ({id, username} = r.result);

                input = r.remaining;
                break;
            }
            case "teamsize":
            {
                const r = messageBattleInitTeamSize(input, info);
                if (!teamSizes)
                {
                    teamSizes = {} as BattleInitMessage["teamSizes"];
                }
                teamSizes[r.result.id] = r.result.size;

                input = r.remaining;
                break;
            }
            case "gametype":
            {
                const r = messageBattleInitGameType(input, info);
                gameType = r.result;

                input = r.remaining;
                break;
            }
            case "gen":
            {
                const r = messageBattleInitGen(input, info);
                gen = r.result;

                input = r.remaining;
                break;
            }
                // TODO: team preview
            default:
                if (isBattleEventPrefix(prefix))
                {
                    // start of initial events
                    const r = battleEvents(input, info);
                    events.push(...r.result);
                    input = r.remaining;
                }
                // else ignore
        }

        // skip until next line (after the newline)
        input = skipLine(input, info).remaining.next();
    }

    // ignore invalid messages
    if (!id || !username || !teamSizes ||
        (!teamSizes.p1 || !teamSizes.p2) || !gameType || !gen)
    {
        // a single initial |player| message was probably sent, since that
        //  usually happens before the full one
        info.logger.debug("Ignoring invalid battleinit message");
        return {result: Promise.resolve(), remaining: input };
    }
    return dispatch("battleinit",
        {id, username, teamSizes, gameType, gen, events})(input, info);
}

const messageBattleInitPlayer = transform(
    sequence(word("player"), playerId, anyWord),
    ([_, id, username]) => ({id, username}));

const messageBattleInitTeamSize = transform(
    sequence(word("teamsize"), playerId, integer),
    ([_, id, size]) => ({id, size}));

const messageBattleInitGameType = transform(sequence(word("gametype"), anyWord),
        ([_, gameType]) => gameType);

const messageBattleInitGen = transform(sequence(word("gen"), integer),
        ([_, gen]) => gen);

/** Parses a `battleprogress` multiline message */
const messageBattleProgress: MessageParser = chain(battleEvents,
        events => dispatch("battleprogress", {events}));

/** Parses any number of BattleEvents. */
function battleEvents(input: Input, info: Info): Result<AnyBattleEvent[]>
{
    const result: AnyBattleEvent[] = [];

    while (!input.done)
    {
        // the parser doesn't have to consume the whole line since the rest of
        //  it will be skipped over
        try
        {
            const r = battleEvent(input, info);
            if (r.result) result.push(r.result);
            input = r.remaining;
        }
        catch (e) { info.logger.error(e); }

        // skip until next line (after the newline)
        input = skipLine(input, info).remaining.next();
    }

    return {result, remaining: input};
}

/**
 * Parses a BattleEvent with optional Cause suffix. Throws if invalid. Can also
 * return null in the result if the failure is meant to be silent.
 */
function battleEvent(input: Input, info: Info): Result<AnyBattleEvent | null>
{
    const r1 = battleEventHelper(input, info);

    if (r1.result)
    {
        let cause: Cause | undefined;
        // parse an optional cause suffix
        // may have to go through unconsumed input to get to it
        while (!cause && !input.done && input.get() !== "\n")
        {
            const r2 = battleEventCause(input, info);
            input = r2.remaining;
            if (r2.result) cause = r2.result;
            // not a valid/relevant Cause so skip it
            else input = input.next();
        }

        if (cause)
        {
            return {result: {...r1.result, cause}, remaining: r1.remaining};
        }
    }

    return r1;
}

/**
 * Parses a BattleEvent. Throws if invalid. Can also return null in the result
 * if the failure is meant to be silent.
 */
function battleEventHelper(input: Input, info: Info):
    Result<AnyBattleEvent | null>
{
    switch (input.get() as BattleEventPrefix)
    {
        case "-ability": return eventAbility(input, info);
        case "-activate": return eventActivate(input, info);
        case "detailschange": case "drag": case "-formechange": case "switch":
            return eventAllDetails(input, info);
        case "-boost": return eventBoost(input, info);
        case "cant": return eventCant(input, info);
        case "-clearallboost": return eventClearAllBoost(input, info);
        case "-clearboost": return eventClearBoost(input, info);
        case "-clearnegativeboost": return eventClearNegativeBoost(input, info);
        case "-clearpositiveboost": return eventClearPositiveBoost(input, info);
        case "-copyboost": return eventCopyBoost(input, info);
        case "-curestatus": return eventCureStatus(input, info);
        case "-cureteam": return eventCureTeam(input, info);
        case "-damage": case "-heal": return eventDamage(input, info);
        case "-end": return eventEnd(input, info);
        case "-endability": return eventEndAbility(input, info);
        case "faint": return eventFaint(input, info);
        case "-fieldstart": case "-fieldend": return eventField(input, info);
        case "-invertboost": return eventInvertBoost(input, info);
        case "move": return eventMove(input, info);
        case "-mustrecharge": return eventMustRecharge(input, info);
        case "-prepare": return eventPrepare(input, info);
        case "-setboost": return eventSetBoost(input, info);
        case "-sethp": return eventSetHP(input, info);
        case "-sideend": return eventSideEnd(input, info);
        case "-sidestart": return eventSideStart(input, info);
        case "-singleturn": return eventSingleTurn(input, info);
        case "-start": return eventStart(input, info);
        case "-status": return eventStatus(input, info);
        case "-swapboost": return eventSwapBoost(input, info);
        case "tie": return eventTie(input, info);
        case "turn": return eventTurn(input, info);
        case "-unboost": return eventUnboost(input, info);
        case "upkeep": return eventUpkeep(input, info);
        case "-weather": return eventWeather(input, info);
        case "win": return eventWin(input, info);
        default:
            // silently ignore this message line
            return {result: null, remaining: input};
    }
}

// event parsers

/**
 * Parses an AbilityEvent.
 *
 * Format:
 * @example
 * |-ability|<PokemonID>|<ability name>
 */
const eventAbility: Parser<AbilityEvent> = transform(
    sequence(word("-ability"), pokemonId, anyWord),
    ([_, id, ability]) => ({type: "ability", id, ability}));

/**
 * Parses an ActivateEvent.
 *
 * Format:
 * @example
 * |-activate|<PokemonID>|<volatile status>
 */
const eventActivate: Parser<ActivateEvent> = transform(
    sequence(word("-activate"), pokemonId, anyWord),
    ([_, id, volatile]) => ({type: "activate", id, volatile}));

/**
 * Parses a BoostEvent.
 *
 * Format:
 * @example
 * |-boost|<PokemonID>|<stat name>|<amount>
 */
const eventBoost: Parser<BoostEvent> = transform(
    sequence(word("-boost"), pokemonId, boostName, integer),
    ([_, id, stat, amount]) => ({type: "boost", id, stat, amount}));

/**
 * Parses a CantEvent.
 *
 * Format:
 * @example
 * |cant|<PokemonID>|<reason>|<move (optional)>
 */
const eventCant: Parser<CantEvent> = transform(
    sequence(word("cant"), pokemonId, anyWord, maybe(anyWord)),
    ([_, id, reason, moveName]) =>
        moveName ?
            {type: "cant", id, reason, moveName}
            : {type: "cant", id, reason});

/**
 * Parses a ClearAllBoostEvent.
 *
 * Format:
 * @example
 * |-clearallboost
 */
const eventClearAllBoost: Parser<ClearAllBoostEvent> =
    transform(word("-clearallboost"), () => ({type: "clearallboost"}));

/**
 * Parses a ClearBoostEvent.
 *
 * Format:
 * @example
 * |-clearboost|<PokemonID>
 */
const eventClearBoost: Parser<ClearBoostEvent> = transform(
    sequence(word("-clearboost"), pokemonId),
    ([_, id]) => ({type: "clearboost", id}));

/**
 * Parses a ClearNegativeBoostEvent.
 *
 * Format:
 * @example
 * |-clearnegativeboost|<PokemonID>
 */
const eventClearNegativeBoost: Parser<ClearNegativeBoostEvent> = transform(
    sequence(word("-clearnegativeboost"), pokemonId),
    ([_, id]) => ({type: "clearnegativeboost", id}));

/**
 * Parses a ClearPositiveBoostEvent.
 *
 * Format:
 * @example
 * |-clearpositiveboost|<PokemonID>
 */
const eventClearPositiveBoost: Parser<ClearPositiveBoostEvent> = transform(
    sequence(word("-clearpositiveboost"), pokemonId),
    ([_, id]) => ({type: "clearpositiveboost", id}));

/**
 * Parses a CopyBoostEvent.
 *
 * Format:
 * @example
 * |-copyboost|<source PokemonID>|<target PokemonID>
 */
const eventCopyBoost: Parser<CopyBoostEvent> = transform(
    sequence(word("-copyboost"), pokemonId, pokemonId),
    ([_, source, target]) => ({type: "copyboost", source, target}));

/**
 * Parses a CureStatusEvent.
 *
 * Format:
 * @example
 * |-curestatus|<PokemonID>|<cured MajorStatus>
 */
const eventCureStatus: Parser<CureStatusEvent> = transform(
    sequence(word("-curestatus"), pokemonId, majorStatus),
    ([_, id, status]) => ({type: "curestatus", id, majorStatus: status}));

/**
 * Parses a CureTeamEvent.
 *
 * Format:
 * @example
 * |-cureteam|<PokemonID>
 */
const eventCureTeam: Parser<CureTeamEvent> = transform(
    sequence(word("-cureteam"), pokemonId),
    ([_, id]) => ({type: "cureteam", id}));

/**
 * Parses a DamageEvent.
 *
 * Format:
 * @example
 * |<-damage or -heal>|<PokemonID>|<new PokemonStatus>
 */
const eventDamage: Parser<DamageEvent> = transform(
    sequence(word("-damage", "-heal"), pokemonId, pokemonStatus),
    ([_, id, status]) => ({type: "damage", id, status}));

/**
 * Parses an EndEvent.
 *
 * Format:
 * @example
 * |-end|<PokemonID>|<volatile status>
 */
const eventEnd: Parser<EndEvent> = transform(
    sequence(word("-end"), pokemonId, anyWord),
    ([_, id, volatile]) => ({type: "end", id, volatile}));

/**
 * Parses an EndAbilityEvent.
 *
 * Format:
 * @example
 * |-endability|<PokemonID>|<ability name>
 */
const eventEndAbility: Parser<EndAbilityEvent> = transform(
    sequence(word("-endability"), pokemonId, anyWord),
    ([_, id, ability]) => ({type: "endability", id, ability}));

/**
 * Parses a FaintEvent.
 *
 * Format:
 * @example
 * |faint|<PokemonID>
 */
const eventFaint: Parser<FaintEvent> = transform(
    sequence(word("faint"), pokemonId), ([_, id]) => ({type: "faint", id}));

/**
 * Parses a FieldStartEvent or FieldEndEvent.
 *
 * Format:
 * @example
 * |<-fieldstart or -fieldend>|<effect>
 */
const eventField: Parser<FieldEndEvent | FieldStartEvent> = transform(
    sequence(word("-fieldstart", "-fieldend"), anyWord),
    ([prefix, effect]) => prefix === "-fieldstart" ?
        {type: "fieldstart", effect} : {type: "fieldend", effect});

/**
 * Parses a InvertBoostEvent.
 *
 * Format:
 * @example
 * |-invertboost|<PokemonID>
 */
const eventInvertBoost: Parser<InvertBoostEvent> = transform(
    sequence(word("-invertboost"), pokemonId),
    ([_, id]) => ({type: "invertboost", id}));

/**
 * Parses a MoveEvent.
 *
 * Format:
 * @example
 * |move|<user PokemonID>|<move name>|<optional target PokemonID>
 *
 * // optional message suffixes (may parse later?)
 * |[miss]
 * |[still]
 */
const eventMove: Parser<MoveEvent> = transform(
    sequence(word("move"), pokemonId, anyWord, maybe(pokemonId)),
    ([_, id, moveName, targetId]) => targetId ?
        {type: "move", id, moveName, targetId} : {type: "move", id, moveName});

/**
 * Parses a MustRechargeEvent.
 *
 * Format:
 * @example
 * |-mustrecharge|<PokemonID>
 */
const eventMustRecharge: Parser<MustRechargeEvent> = transform(
    sequence(word("-mustrecharge"), pokemonId),
    ([_, id]) => ({type: "mustrecharge", id}));

/**
 * Parses a PrepareEvent.
 *
 * Format:
 * @example
 * |-prepare|<user PokemonID>|<move name>|<optional target PokemonID>
 */
const eventPrepare: Parser<PrepareEvent> = transform(
    sequence(word("-prepare"), pokemonId, anyWord, maybe(pokemonId)),
    ([_, id, moveName, targetId]) => targetId ?
        {type: "prepare", id, moveName, targetId}
        : {type: "prepare", id, moveName});

/**
 * Parses a SetBoostEvent.
 *
 * Format:
 * @example
 * |-setboost|<PokemonID>|<stat name>|<amount>
 */
const eventSetBoost: Parser<SetBoostEvent> = transform(
    sequence(word("-setboost"), pokemonId, boostName, integer),
    ([_, id, stat, amount]) => ({type: "setboost", id, stat, amount}));

/**
 * Parses a SetHPEvent.
 *
 * Format:
 * @example
 * |-sethp|<PokemonID 1>|<PokemonStatus 1>|<PokemonID 2>|<PokemonStatus 2>|...
 */
const eventSetHP: Parser<SetHPEvent> = transform(
    sequence(
        word("-sethp"),
        many(
            transform(
                sequence(pokemonId, pokemonStatus),
                ([id, status]) => ({id, status})))),
    ([_, newHPs]) => ({type: "sethp", newHPs}));

/**
 * Parses a SideEndEvent.
 *
 * Format:
 * @example
 * |-sideend|<PlayerID>: <username>|<condition>
 */
const eventSideEnd: Parser<SideEndEvent> = transform(
    sequence(word("-sideend"), playerIdWithName, anyWord),
    ([_, {id}, condition]) => ({type: "sideend", id, condition}));

/**
 * Parses a SideStartEvent.
 *
 * Format:
 * @example
 * |-sidestart|<PlayerID>: <username>|<condition>
 */
const eventSideStart: Parser<SideStartEvent> = transform(
    sequence(word("-sidestart"), playerIdWithName, anyWord),
    ([_, {id}, condition]) => ({type: "sidestart", id, condition}));

/**
 * Parses a SingleTurnEvent.
 *
 * Format:
 * @example
 * |-singleturn|<PokemonID>|<status>
 */
const eventSingleTurn: Parser<SingleTurnEvent> = transform(
    sequence(word("-singleturn"), pokemonId, anyWord),
    ([_, id, status]) => ({type: "singleturn", id, status}));

/**
 * Parses a StartEvent.
 *
 * Format:
 * @example
 * |-start|<PokemonID>|<volatile>|<other args>
 *
 * // optional message suffixes:
 * [fatigue]
 */
const eventStart: Parser<StartEvent> = transform(
    sequence(word("-start"), pokemonId, anyWord, eventStartHelper),
    ([_, id, volatile, {otherArgs, cause}]) =>
        cause ? {type: "start", id, volatile, otherArgs, cause}
        : {type: "start", id, volatile, otherArgs});

/**
 * Equivalent to `sequence(some(anyWord), maybe(battleEventCause))` but is
 * non-greedy and turns the result into a dictionary instead of an array.
 */
function eventStartHelper(input: Input, info: Info):
    Result<{otherArgs: string[], cause?: Cause}>
{
    const otherArgs: string[] = [];
    let cause: Cause | undefined;

    while (!input.done && input.get() !== "\n")
    {
        const s = input.get();

        // istanbul ignore else: nothing else to parse after cause
        if (!cause)
        {
            // attempt to parse Cause object, which could fail either loudly or
            //  quietly
            try
            {
                const r = battleEventCause(input, info);
                if (r.result)
                {
                    cause = r.result;
                    input = r.remaining;
                }
            }
            catch (e) {}
        }
        else input = input.next();

        if (!cause)
        {
            otherArgs.push(s);
            input = input.next();
        }
    }

    return {result: cause ? {otherArgs, cause} : {otherArgs}, remaining: input};
}

/**
 * Parses a StatusEvent.
 *
 * Format:
 * @example
 * |-status|<PokemonID>|<new MajorStatus>
 */
const eventStatus: Parser<StatusEvent> = transform(
    sequence(word("-status"), pokemonId, majorStatus),
    ([_, id, status]) => ({type: "status", id, majorStatus: status}));

/**
 * Parses a SwapBoostEvent.
 *
 * Format:
 * @example
 * |-swapboost|<PokemonID>|<other PokemonID>|<optional <stat1>, <stat2>, <...>>
 */
const eventSwapBoost: Parser<SwapBoostEvent> = transform(
    sequence(
        word("-swapboost"), pokemonId, pokemonId,
        maybe(
            // parse comma-separated list of boost names
            input =>
            ({
                result: input.get().split(", ").map(parseBoostName),
                remaining: input.next()
            }),
            // if omitted, assume all boosts
            Object.keys(boostNames) as BoostName[])),
    ([_, source, target, stats]) =>
        ({type: "swapboost", source, target, stats}));

/**
 * Parses a DetailsChangeEvent, FormeChangeEvent, SwitchEvent.
 *
 * Format:
 * @example
 * |<switch or drag or detailschange or -formechange>|<replacing PokemonID>|\
 * <PokemonDetails>|<PokemonStatus>
 */
const eventAllDetails:
    Parser<SwitchEvent | DetailsChangeEvent | FormeChangeEvent> = transform(
    sequence(
        word("switch", "drag", "detailschange", "-formechange"), pokemonId,
        pokemonDetails, pokemonStatus),
    function([type, id, details, status])
{
    switch (type)
    {
        case "drag": case "switch": case "detailschange":
            return {type, id, details, status};
        case "-formechange": return {type: "formechange", id, details, status};
    }
});

/**
 * Parses an UnboostEvent.
 *
 * Format:
 * @example
 * |-unboost|<PokemonID>|<stat name>|<amount>
 */
const eventUnboost: Parser<UnboostEvent> = transform(
    sequence(word("-unboost"), pokemonId, boostName, integer),
    ([_, id, stat, amount]) => ({type: "unboost", id, stat, amount}));

/**
 * Parses an UpkeepEvent.
 *
 * Format:
 * @example
 * |upkeep
 */
const eventUpkeep: Parser<UpkeepEvent> = transform(word("upkeep"),
        () => ({type: "upkeep"}));

/**
 * Parses a TurnEvent.
 *
 * Format:
 * @example
 * |turn|<new turn number>
 */
const eventTurn: Parser<TurnEvent> = transform(sequence(word("turn"), integer),
        ([_, num]) => ({type: "turn", num}));

/**
 * Parses a TieEvent.
 *
 * Format:
 * @example
 * |tie
 */
const eventTie: Parser<TieEvent> = transform(word("tie"),
        () => ({type: "tie"}));

/**
 * Parses a WeatherEvent.
 *
 * Format:
 * @example
 * |-weather|<WeatherType>|<optional [upkeep] or AbilityCause or MoveCause>
 */
const eventWeather: Parser<WeatherEvent> = transform(
    sequence(
        word("-weather"),
        weatherType,
        transform(maybe(word("[upkeep]")), upkeep => !!upkeep)),
    ([_, type, upkeep]) => ({type: "weather", weatherType: type, upkeep}));

/**
 * Parses a WinEvent.
 *
 * Format:
 * @example
 * |win|<username>
 */
const eventWin: Parser<WinEvent> = transform(sequence(word("win"), restOfLine),
        ([_, winner]) => ({type: "win", winner}));

// cause parser

/**
 * Parses an event Cause. Throws if invalid. Can also return null in the result
 * if the failure is meant to be silent.
 */
function battleEventCause(input: Input, info: Info): Result<Cause | null>
{
    const str = input.get();
    if (str.startsWith("[from] ability: "))
    {
        const ability = str.substr("[from] ability: ".length);

        // parse possible "of" suffix
        const nextInput = input.next();
        const next = nextInput.get();
        if (next && next.startsWith("[of] "))
        {
            const of = parsePokemonID(next.substr("[of] ".length));
            return {
                result: {type: "ability", ability, of},
                remaining: nextInput.next()
            };
        }

        return {result: {type: "ability", ability}, remaining: nextInput};
    }
    if (str === "[fatigue]")
    {
        return {result: {type: "fatigue"}, remaining: input.next()};
    }
    if (str.startsWith("[from] item: "))
    {
        return {
            result: {type: "item", item: str.substr("[from] item: ".length)},
            remaining: input.next()
        };
    }
    if (str === "[from]lockedmove")
    {
        return {result: {type: "lockedmove"}, remaining: input.next()};
    }

    // could be either invalid or irrelevant
    return {result: null, remaining: input};
}
