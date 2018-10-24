import { BattleInitArgs, BattleProgressArgs, RequestArgs } from
    "../../src/AnyMessageListener";
import { BattleEvent, BattleEventAddon, BattleUpkeep, MoveEvent, PokemonDetails,
    PokemonID, PokemonStatus, SwitchInEvent } from "../../src/messageData";

/**
 * Creates an unparsed server message.
 * @param words String arguments for the message.
 * @returns An unparsed message.
 */
export function buildMessage(words: string[][]): string
{
    return words
        .map(line => line.length > 0 ? `|${line.join("|")}` : "")
        .join("\n");
}

/**
 * Stringifies the object from a |request| message back to normal JSON.
 * @param data Data to stringify.
 * @returns A re-parseable |request| JSON string.
 */
export function stringifyRequest(data: RequestArgs): string
{
    // deep copy
    const obj: any = JSON.parse(JSON.stringify(data));

    // need to put some data back into string form
    for (const mon of obj.side.pokemon)
    {
        // ident, details, and condition fields are the same
        //  as the data from a |switch| message
        mon.ident = stringifyID(mon.ident);
        mon.details = stringifyDetails(mon.details);
        mon.condition = stringifyStatus(mon.condition);
    }
    return JSON.stringify(obj);
}

/**
 * Composes all the word segments of a `battleinit` message type.
 * @param args Arguments to be stringified.
 * @returns An unparsed BattleInitArgs.
 */
export function composeBattleInit(args: BattleInitArgs): string[][]
{
    const result: string[][] =
    [
        ["player", args.id, args.username],
        ["teamsize", "p1", args.teamSizes.p1.toString()],
        ["teamsize", "p2", args.teamSizes.p2.toString()],
        ["gametype", args.gameType],
        ["gen", args.gen.toString()],
        ...args.switchIns
            .map(composeSwitchInEvent)
            .reduce((a, b) => a.concat(b), [])
    ];
    return result;
}

/**
 * Composes all the word segments of a `battleprogress` message type.
 * @param args Arguments to be stringified.
 * @returns An unparsed BattleProgressArgs.
 */
export function composeBattleProgress(args: BattleProgressArgs): string[][]
{
    const result: string[][] =
        args.events
            .map(composeBattleEvent)
            .reduce((a, b) => a.concat(b), []);

    // upkeep and new turn number are separated by a blank line
    if (args.upkeep || args.turn)
    {
        result.push([""]);
        if (args.upkeep) result.push(...composeBattleUpkeep(args.upkeep));
        if (args.turn) result.push(["turn", args.turn.toString()]);
    }

    return result;
}

/**
 * Composes all the word segments of a BattleEvent.
 * @param event Event to stringify.
 * @returns An unparsed BattleEvent.
 */
export function composeBattleEvent(event: BattleEvent): string[][]
{
    switch (event.type)
    {
        case "move": return composeMoveEvent(event);
        case "switch": return composeSwitchInEvent(event);
        default: return [];
    }
}

/**
 * Composes all the word segments of a MoveEvent.
 * @param event Event to stringify.
 * @returns An unparsed MoveEvent.
 */
export function composeMoveEvent(event: MoveEvent): string[][]
{
    const result: string[][] =
    [
        [
            "move", stringifyID(event.id), event.moveName,
            stringifyID(event.targetId),
            ...(event.from ? [`[from]${event.from}`] : [])
        ],
        ...event.addons.map(composeAddon)
    ];
    return result;
}

/**
 * Composes all the word segments of a SwitchInEvent.
 * @param event Event to stringify.
 * @returns An unparsed SwitchInEvent.
 */
export function composeSwitchInEvent(event: SwitchInEvent): string[][]
{
    const result: string[][] =
    [
        [
            "switch", stringifyID(event.id), stringifyDetails(event.details),
            stringifyStatus(event.status)
        ],
        ...event.addons.map(composeAddon)
    ];
    return result;
}

/**
 * Composes all the word segments of a BattleUpkeep.
 * @param upkeep Object to stringify.
 * @returns An unparsed BattleUpkeep.
 */
export function composeBattleUpkeep(upkeep: BattleUpkeep): string[][]
{
    return [...upkeep.addons.map(composeAddon), ["upkeep"]];
}

/**
 * Composes all the word segments of a BattleEventAddon.
 * @param addon Addon to stringify.
 * @returns An unparsed BattleEventAddon.
 */
export function composeAddon(addon: BattleEventAddon): string[]
{
    let result: string[];
    switch (addon.type)
    {
        case "ability":
            result = ["-ability", stringifyID(addon.id), addon.ability];
            break;
        case "curestatus":
        case "status":
            result =
            [
                "-" + addon.type, stringifyID(addon.id), addon.majorStatus
            ];
            break;
        case "cureteam":
            result = ["-cureteam", stringifyID(addon.id)];
            break;
        case "damage":
        case "heal":
            result =
            [
                "-" + addon.type, stringifyID(addon.id),
                stringifyStatus(addon.status)
            ];
            break;
        case "faint":
            result = ["faint", stringifyID(addon.id)];
            break;
        default:
            result = [];
    }
    return result;
}

/**
 * Stringifies a PokemonID.
 * @param id ID object.
 * @returns The PokemonID in string form.
 */
export function stringifyID(id: PokemonID): string
{
    return `${id.owner}${id.position}: ${id.nickname}`;
}

/**
 * Stringifies a PokemonDetails.
 * @param details Details object.
 * @returns The PokemonDetails in string form.
 */
export function stringifyDetails(details: PokemonDetails): string
{
    const arr = [details.species];
    if (details.shiny) arr.push("shiny");
    if (details.gender) arr.push(details.gender);
    if (details.level !== 100) arr.push(`L${details.level}`);
    return arr.join(", ");
}

/**
 * Stringifies a PokemonStatus.
 * @param details Status object.
 * @returns The PokemonStatus in string form.
 */
export function stringifyStatus(status: PokemonStatus): string
{
    if (status.hp === 0)
    {
        return "0 fnt";
    }
    return `${status.hp}/${status.hpMax}\
${status.condition ? ` ${status.condition}` : ""}`;
}
