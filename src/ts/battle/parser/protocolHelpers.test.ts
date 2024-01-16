import {Protocol} from "@pkmn/protocol";
import {
    FieldCondition,
    ID,
    SideCondition,
    SideID,
    TypeName,
    Weather,
} from "@pkmn/types";
import * as dex from "../dex";
import {toIdName} from "../helpers";
import {smeargle} from "../state/switchOptions.test";

// Match with protocol type names.
/* eslint-disable @typescript-eslint/naming-convention */

export function toIdent(
    side: SideID,
    opt = smeargle,
    pos: Protocol.PositionLetter | null = "a",
): Protocol.PokemonIdent {
    const species = dex.pokemon[opt.species];
    return `${side}${pos ?? ""}: ${
        species?.display ?? opt.species
    }` as Protocol.PokemonIdent;
}

export function toDetails(opt = smeargle): Protocol.PokemonDetails {
    const words = [dex.pokemon[opt.species]?.display ?? opt.species];
    if (opt.level !== 100) {
        words.push(`L${opt.level}`);
    }
    if (opt.gender !== "N") {
        words.push(opt.gender);
    }
    return words.join(", ") as Protocol.PokemonDetails;
}

export function toHPStatus(faint: "faint"): Protocol.PokemonHPStatus;
export function toHPStatus(
    hp: number,
    maxhp?: number,
    status?: string,
): Protocol.PokemonHPStatus;
export function toHPStatus(
    hp: number | "faint",
    maxhp = 100,
    status?: string,
): Protocol.PokemonHPStatus {
    if (hp === "faint") {
        return "0 fnt" as Protocol.PokemonHPStatus;
    }
    let s = `${hp}/${maxhp}`;
    if (status) {
        s += " " + status;
    }
    return s as Protocol.PokemonHPStatus;
}

export function toEffectName(name: string): Protocol.EffectName;
export function toEffectName(
    id: string,
    type: "ability" | "item" | "move",
): Protocol.EffectName;
export function toEffectName(
    nameOrId: string,
    type?: "ability" | "item" | "move",
): Protocol.EffectName;
export function toEffectName(
    id: string,
    type?: "ability" | "item" | "move",
): Protocol.EffectName {
    let name: string;
    switch (type) {
        case "ability":
            name = toAbilityName(id);
            break;
        case "item":
            name = toItemName(id);
            break;
        case "move":
            name = toMoveName(id);
            break;
        default:
            return id as Protocol.EffectName;
    }
    return `${type}: ${name}` as Protocol.EffectName;
}

export function toAbilityName(id: string): Protocol.AbilityName {
    return (dex.abilities[id]?.display ?? id) as Protocol.AbilityName;
}

export function toItemName(id: string): Protocol.ItemName {
    return (dex.items[id]?.display ?? id) as Protocol.ItemName;
}

export function toMoveName(id: string): Protocol.MoveName {
    return (dex.moves[id]?.display ?? id) as Protocol.MoveName;
}

export function toSpeciesName(id: string): Protocol.SpeciesName {
    return (dex.pokemon[id]?.display ?? id) as Protocol.SpeciesName;
}

export function toNum(num: number): Protocol.Num {
    return num.toString() as Protocol.Num;
}

export function toTypes(...types: dex.Type[]): Protocol.Types {
    return types.map(toTypeName).join("/") as Protocol.Types;
}

export function toTypeName(type: dex.Type): TypeName {
    return (type[0].toUpperCase() + type.substring(1)) as Capitalize<dex.Type>;
}

export function toMessage(msg: string): Protocol.Message {
    return msg as Protocol.Message;
}

export function toWeather(weather: dex.WeatherType): Weather {
    return weather as Weather;
}

export function toFieldCondition(id: string): FieldCondition {
    return toMoveName(id) as unknown as FieldCondition;
}

export function toSideCondition(id: string): SideCondition {
    return toMoveName(id) as unknown as SideCondition;
}

export function toBoostIDs(...boosts: dex.BoostName[]): Protocol.BoostIDs {
    return boosts.join(", ") as Protocol.BoostIDs;
}

export function toSide(side: SideID, username: string): Protocol.Side {
    return `${side}: ${username}` as Protocol.Side;
}

export function toRequestJSON(obj: Protocol.Request): Protocol.RequestJSON {
    return JSON.stringify(obj) as Protocol.RequestJSON;
}

export function toSeed(seed: string): Protocol.Seed {
    return seed as Protocol.Seed;
}

export function toUsername(username: string): Protocol.Username {
    return username as Protocol.Username;
}

export function toID(name: string): ID {
    return toIdName(name) as ID;
}

export function toSearchID(
    side: SideID,
    opt = smeargle,
    pos: Protocol.PositionLetter = "a",
): Protocol.PokemonSearchID {
    return `${toIdent(side, opt, pos)}|${toDetails(
        opt,
    )}` as Protocol.PokemonSearchID;
}

export function toFormatName(name: string): Protocol.FormatName {
    return name as Protocol.FormatName;
}

export function toRule(name: string): Protocol.Rule {
    return name as Protocol.Rule;
}

export function toNickname(name: string): Protocol.Nickname {
    return name as Protocol.Nickname;
}

/* eslint-enable @typescript-eslint/naming-convention */
