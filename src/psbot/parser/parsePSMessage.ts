/** @file Exposes the `parsePSMessage` function. */
import { BoostName, boostNames } from "../../battle/dex/dex-util";
import { Logger } from "../../Logger";
import { AbilityEvent, ActivateEvent, AnyBattleEvent, BattleEventType,
    BoostEvent, CantEvent, ClearAllBoostEvent, ClearBoostEvent,
    ClearNegativeBoostEvent, ClearPositiveBoostEvent, CopyBoostEvent,
    CureStatusEvent, CureTeamEvent, DamageEvent, DetailsChangeEvent,
    DragEvent, EmptyEvent, EndAbilityEvent, EndEvent, EndItemEvent, FailEvent,
    FaintEvent, FieldEndEvent, FieldStartEvent, FormeChangeEvent, HealEvent,
    ImmuneEvent, InvertBoostEvent, isBattleEventType, ItemEvent, MissEvent,
    MoveEvent, MustRechargeEvent, PrepareEvent, SetBoostEvent, SetHPEvent,
    SideEndEvent, SideStartEvent, SingleTurnEvent, StartEvent, StatusEvent,
    SwapBoostEvent, SwitchEvent, TieEvent, TransformEvent, TurnEvent,
    UnboostEvent, UpkeepEvent, WeatherEvent, WinEvent } from
    "../dispatcher/BattleEvent";
import { BattleInitMessage, MajorPrefix } from "../dispatcher/Message";
import { MessageListener } from "../dispatcher/MessageListener";
import { PlayerID } from "../helpers";
import { chain, maybe, sequence, transform } from "./combinators";
import { anyWord, boostName, dispatch, integer, json, majorStatus,
    parseBoostName, parseFromSuffix, parsePokemonDetails, parsePokemonID,
    parsePokemonStatus, playerId, playerIdWithName, pokemonDetails, pokemonId,
    pokemonStatus, restOfLine, skipLine, weatherTypeOrNone, word } from
    "./helpers";
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
    const prefix = input.get() as MajorPrefix | "player" | BattleEventType;

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
            if (isBattleEventType(prefix))
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
                if (isBattleEventType(prefix))
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
        // invalid BattleEvents can throw, so filter those out
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
 * Parses a BattleEvent with optional suffixes. Throws if invalid. Result
 * contains null if the event type is unsupported.
 */
function battleEvent(input: Input, info: Info): Result<AnyBattleEvent | null>
{
    const r1 = battleEventHelper(input, info);
    if (!r1.result) return r1;

    // parse optional suffixes
    let event: AnyBattleEvent = r1.result;
    while (!input.done && input.get() !== "\n")
    {
        const s = input.get();
        const matches = s.match(
            // matches "[x]", "[x]y", and "[x] y", where the named group
            //  "prefix" matches to "x" and "value" matches to "y" or undefined
            /^\[(?<prefix>\w+)\]\s?(?<value>.*)/);
        if (matches && matches.groups)
        {
            const prefix = matches.groups.prefix;
            const value = matches.groups.value;
            if (prefix === "of")
            {
                event = {...event, of: parsePokemonID(value)};
            }
            else if (prefix === "from")
            {
                const from = parseFromSuffix(value);
                // istanbul ignore else: trivial
                if (from) event = {...event, from};
            }
            else if (prefix === "fatigue") event = {...event, fatigue: true};
            else if (prefix === "eat") event = {...event, eat: true};
            else if (prefix === "miss") event = {...event, miss: true};
        }
        input = input.next();
    }

    r1.result = event;
    return r1;
}

/**
 * Parses a BattleEvent. Throws if invalid. Can also return null in the result
 * if the failure is meant to be silent.
 */
function battleEventHelper(input: Input, info: Info):
    Result<AnyBattleEvent | null>
{
    switch (input.get() as BattleEventType)
    {
        case "\n": return eventEmpty(input, info);
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
        case "-fail": return eventFail(input, info);
        case "faint": return eventFaint(input, info);
        case "-fieldstart": case "-fieldend": return eventField(input, info);
        case "-immune": return eventImmune(input, info);
        case "-invertboost": return eventInvertBoost(input, info);
        case "-item": case "-enditem": return eventItem(input, info);
        case "-miss": return eventMiss(input, info);
        case "move": return eventMove(input, info);
        case "-mustrecharge": return eventMustRecharge(input, info);
        case "-prepare": return eventPrepare(input, info);
        case "-setboost": return eventSetBoost(input, info);
        case "-sethp": return eventSetHP(input, info);
        case "-sideend": case "-sidestart": return eventSide(input, info);
        case "-singleturn": return eventSingleTurn(input, info);
        case "-start": return eventStart(input, info);
        case "-status": return eventStatus(input, info);
        case "-swapboost": return eventSwapBoost(input, info);
        case "tie": return eventTie(input, info);
        case "-transform": return eventTransform(input, info);
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
 * Parses an EmptyEvent.
 *
 * Format:
 * @example
 * |
 */
const eventEmpty: Parser<EmptyEvent> = (input, info) =>
    ({result: {type: "\n"}, remaining: input});

/**
 * Parses an AbilityEvent.
 *
 * Format:
 * @example
 * |-ability|<PokemonID>|<ability name>
 */
const eventAbility: Parser<AbilityEvent> = transform(
    sequence(word("-ability"), pokemonId, anyWord),
    ([type, id, ability]) => ({type, id, ability}));

/**
 * Parses an ActivateEvent.
 *
 * Format:
 * @example
 * |-activate|<PokemonID>|<volatile status>
 */
const eventActivate: Parser<ActivateEvent> = transform(
    sequence(word("-activate"), pokemonId, anyWord, eventActivateHelper),
    ([type, id, volatile, otherArgs]) => ({type, id, volatile, otherArgs}));

/**
 * Parses the `otherArgs` part of an `|-activate|` or `|-start|` event
 * without accidentally parsing a suffix.
 */
function eventActivateHelper(input: Input, info: Info): Result<string[]>
{
    const result: string[] = [];

    while (!input.done && input.get() !== "\n")
    {
        const s = input.get();
        if (!s.startsWith("[")) result.push(s);
        input = input.next();
    }

    return {result, remaining: input};
}

/**
 * Parses a BoostEvent.
 *
 * Format:
 * @example
 * |-boost|<PokemonID>|<stat name>|<amount>
 */
const eventBoost: Parser<BoostEvent> = transform(
    sequence(word("-boost"), pokemonId, boostName, integer),
    ([type, id, stat, amount]) => ({type, id, stat, amount}));

/**
 * Parses a CantEvent.
 *
 * Format:
 * @example
 * |cant|<PokemonID>|<reason>|<move (optional)>
 */
const eventCant: Parser<CantEvent> = transform(
    sequence(word("cant"), pokemonId, anyWord, eventCantHelper),
    ([type, id, reason, moveName]) =>
        moveName ? {type, id, reason, moveName} : {type, id, reason});

/**
 * Parses the `moveName` part of a `|cant|` message without accidentally parsing
 * a suffix.
 */
function eventCantHelper(input: Input, info: Info): Result<string | undefined>
{
    const s = input.get();
    if (s.startsWith("[") || s === "\n")
    {
        return {result: undefined, remaining: input};
    }
    return {result: s, remaining: input.next()};
}

/**
 * Parses a ClearAllBoostEvent.
 *
 * Format:
 * @example
 * |-clearallboost
 */
const eventClearAllBoost: Parser<ClearAllBoostEvent> =
    transform(word("-clearallboost"), type => ({type}));

/**
 * Parses a ClearBoostEvent.
 *
 * Format:
 * @example
 * |-clearboost|<PokemonID>
 */
const eventClearBoost: Parser<ClearBoostEvent> = transform(
    sequence(word("-clearboost"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses a ClearNegativeBoostEvent.
 *
 * Format:
 * @example
 * |-clearnegativeboost|<PokemonID>
 */
const eventClearNegativeBoost: Parser<ClearNegativeBoostEvent> = transform(
    sequence(word("-clearnegativeboost"), pokemonId),
    ([type, id]) => ({type, id}));

/**
 * Parses a ClearPositiveBoostEvent.
 *
 * Format:
 * @example
 * |-clearpositiveboost|<PokemonID>
 */
const eventClearPositiveBoost: Parser<ClearPositiveBoostEvent> = transform(
    sequence(word("-clearpositiveboost"), pokemonId),
    ([type, id]) => ({type, id}));

/**
 * Parses a CopyBoostEvent.
 *
 * Format:
 * @example
 * |-copyboost|<source PokemonID>|<target PokemonID>
 */
const eventCopyBoost: Parser<CopyBoostEvent> = transform(
    sequence(word("-copyboost"), pokemonId, pokemonId),
    ([type, source, target]) => ({type, source, target}));

/**
 * Parses a CureStatusEvent.
 *
 * Format:
 * @example
 * |-curestatus|<PokemonID>|<cured MajorStatus>
 */
const eventCureStatus: Parser<CureStatusEvent> = transform(
    sequence(word("-curestatus"), pokemonId, majorStatus),
    ([type, id, status]) => ({type, id, majorStatus: status}));

/**
 * Parses a CureTeamEvent.
 *
 * Format:
 * @example
 * |-cureteam|<PokemonID>
 */
const eventCureTeam: Parser<CureTeamEvent> = transform(
    sequence(word("-cureteam"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses a DamageEvent or HealEvent.
 *
 * Format:
 * @example
 * |<-damage or -heal>|<PokemonID>|<new PokemonStatus>
 */
const eventDamage: Parser<DamageEvent | HealEvent> = transform(
    sequence(word("-damage", "-heal"), pokemonId, pokemonStatus),
    ([type, id, status]) => ({type, id, status}));

/**
 * Parses an EndEvent.
 *
 * Format:
 * @example
 * |-end|<PokemonID>|<volatile status>
 */
const eventEnd: Parser<EndEvent> = transform(
    sequence(word("-end"), pokemonId, anyWord),
    ([type, id, volatile]) => ({type, id, volatile}));

/**
 * Parses an EndAbilityEvent.
 *
 * Format:
 * @example
 * |-endability|<PokemonID>|<ability name>
 */
const eventEndAbility: Parser<EndAbilityEvent> = transform(
    sequence(word("-endability"), pokemonId, anyWord),
    ([type, id, ability]) => ({type, id, ability}));

/**
 * Parses a FailEvent.
 *
 * Format:
 * @example
 * |-fail|<PokemonID>
 */
const eventFail: Parser<FailEvent> =
    transform(sequence(word("-fail"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses a FaintEvent.
 *
 * Format:
 * @example
 * |faint|<PokemonID>
 */
const eventFaint: Parser<FaintEvent> =
    transform(sequence(word("faint"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses a FieldStartEvent or FieldEndEvent.
 *
 * Format:
 * @example
 * |<-fieldstart or -fieldend>|<effect>
 */
const eventField: Parser<FieldEndEvent | FieldStartEvent> = transform(
    sequence(word("-fieldstart", "-fieldend"), anyWord),
    ([type, effect]) => ({type, effect}));

/**
 * Parses an ImmuneEvent.
 *
 * Format:
 * @example
 * |-immune|<PokemonID>
 */
const eventImmune: Parser<ImmuneEvent> = transform(
    sequence(word("-immune"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses an InvertBoostEvent.
 *
 * Format:
 * @example
 * |-invertboost|<PokemonID>
 */
const eventInvertBoost: Parser<InvertBoostEvent> = transform(
    sequence(word("-invertboost"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses an ItemEvent or EndItemEvent.
 *
 * Format:
 * @example
 * |<-item or -enditem>|<PokemonID>|<item name>
 */
const eventItem: Parser<ItemEvent | EndItemEvent> = transform(
    sequence(word("-item", "-enditem"), pokemonId, anyWord),
    ([type, id, item]) => ({type, id, item}));

/**
 * Parses a MissEvent.
 *
 * Format:
 * @example
 * |-miss|<user PokemonID>|<target PokemonID>
 */
const eventMiss: Parser<MissEvent> = transform(
    sequence(word("-miss"), pokemonId, pokemonId),
    ([type, id, targetId]) => ({type, id, targetId}));

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
    ([type, id, moveName, targetId]) =>
        targetId ? {type, id, moveName, targetId} : {type, id, moveName});

/**
 * Parses a MustRechargeEvent.
 *
 * Format:
 * @example
 * |-mustrecharge|<PokemonID>
 */
const eventMustRecharge: Parser<MustRechargeEvent> = transform(
    sequence(word("-mustrecharge"), pokemonId), ([type, id]) => ({type, id}));

/**
 * Parses a PrepareEvent.
 *
 * Format:
 * @example
 * |-prepare|<user PokemonID>|<move name>|<optional target PokemonID>
 */
const eventPrepare: Parser<PrepareEvent> = transform(
    sequence(word("-prepare"), pokemonId, anyWord, maybe(pokemonId)),
    ([type, id, moveName, targetId]) =>
        targetId ? {type, id, moveName, targetId} : {type, id, moveName});

/**
 * Parses a SetBoostEvent.
 *
 * Format:
 * @example
 * |-setboost|<PokemonID>|<stat name>|<amount>
 */
const eventSetBoost: Parser<SetBoostEvent> = transform(
    sequence(word("-setboost"), pokemonId, boostName, integer),
    ([type, id, stat, amount]) => ({type, id, stat, amount}));

/**
 * Parses a SetHPEvent.
 *
 * Format:
 * @example
 * |-sethp|<PokemonID>|<PokemonStatus>
 */
const eventSetHP: Parser<SetHPEvent> = transform(
    sequence(word("-sethp"), pokemonId, pokemonStatus),
    ([type, id, status]) => ({type, id, status}));

/**
 * Parses a SideEndEvent or SideStartEvent.
 *
 * Format:
 * @example
 * |<-sideend or -sidestart>|<PlayerID>: <username>|<condition>
 */
const eventSide: Parser<SideEndEvent | SideStartEvent> = transform(
    sequence(word("-sideend", "-sidestart"), playerIdWithName, anyWord),
    ([type, {id}, condition]) => ({type, id, condition}));

/**
 * Parses a SingleTurnEvent.
 *
 * Format:
 * @example
 * |-singleturn|<PokemonID>|<status>
 */
const eventSingleTurn: Parser<SingleTurnEvent> = transform(
    sequence(word("-singleturn"), pokemonId, anyWord),
    ([type, id, status]) => ({type, id, status}));

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
    sequence(word("-start"), pokemonId, anyWord, eventActivateHelper),
    ([type, id, volatile, otherArgs]) => ({type, id, volatile, otherArgs}));

/**
 * Parses a StatusEvent.
 *
 * Format:
 * @example
 * |-status|<PokemonID>|<new MajorStatus>
 */
const eventStatus: Parser<StatusEvent> = transform(
    sequence(word("-status"), pokemonId, majorStatus),
    ([type, id, status]) => ({type, id, majorStatus: status}));

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
    ([type, source, target, stats]) => ({type, source, target, stats}));

/**
 * Parses a DetailsChangeEvent, DragEvent, FormeChangeEvent, or SwitchEvent.
 *
 * Format:
 * @example
 * |<switch or drag or detailschange or -formechange>|<replacing PokemonID>|\
 * <PokemonDetails>|<PokemonStatus>
 */
const eventAllDetails:
    Parser<SwitchEvent | DragEvent | DetailsChangeEvent | FormeChangeEvent> =
    transform(
        sequence(
            word("switch", "drag", "detailschange", "-formechange"), pokemonId,
            pokemonDetails, pokemonStatus),
        ([type, id, details, status]) => ({type, id, details, status}));

/**
 * Parses an UnboostEvent.
 *
 * Format:
 * @example
 * |-unboost|<PokemonID>|<stat name>|<amount>
 */
const eventUnboost: Parser<UnboostEvent> = transform(
    sequence(word("-unboost"), pokemonId, boostName, integer),
    ([type, id, stat, amount]) => ({type, id, stat, amount}));

/**
 * Parses an UpkeepEvent.
 *
 * Format:
 * @example
 * |upkeep
 */
const eventUpkeep: Parser<UpkeepEvent> =
    transform(word("upkeep"), () => ({type: "upkeep"}));

/**
 * Parses a TurnEvent.
 *
 * Format:
 * @example
 * |turn|<new turn number>
 */
const eventTurn: Parser<TurnEvent> =
    transform(sequence(word("turn"), integer), ([type, num]) => ({type, num}));

/**
 * Parses a TieEvent.
 *
 * Format:
 * @example
 * |tie
 */
const eventTie: Parser<TieEvent> =
    transform(word("tie"), () => ({type: "tie"}));

/**
 * Parses a TransformEvent.
 *
 * Format:
 * @example
 * |-transform|<source PokemonID>|<target PokemonID>
 */
const eventTransform: Parser<TransformEvent> = transform(
    sequence(word("-transform"), pokemonId, pokemonId),
    ([type, source, target]) => ({type, source, target}));

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
        weatherTypeOrNone,
        // transform presence of upkeep word into boolean
        transform(maybe(word("[upkeep]")), upkeep => !!upkeep)),
    ([type, weatherType, upkeep]) => ({type, weatherType, upkeep}));

/**
 * Parses a WinEvent.
 *
 * Format:
 * @example
 * |win|<username>
 */
const eventWin: Parser<WinEvent> = transform(sequence(word("win"), restOfLine),
        ([type, winner]) => ({type, winner}));
