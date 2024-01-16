import {Protocol} from "@pkmn/protocol";
import {Event} from "../../protocol/Event";
import {
    toDetails,
    toHPStatus,
    toID,
    toIdent,
    toRequestJSON,
    toSearchID,
    toSpeciesName,
    toUsername,
} from "../parser/protocolHelpers.test";
import {SwitchOptions} from "./Team";

// TODO: May need to move this to a separate folder or remove some members.

/**
 * Options for switching in a Ditto for testing. Low level allows for
 * 100 hp so it can also be used as a percentage when using this for an
 * opponent.
 */
export const ditto: SwitchOptions = {
    species: "ditto",
    level: 40,
    gender: "N",
    hp: 100,
    hpMax: 100,
};

/**
 * Options for switching in a Smeargle for move testing. Low level allows for
 * 100 hp so it can also be used as a percentage when using this for an
 * opponent.
 */
export const smeargle: SwitchOptions = {
    species: "smeargle",
    level: 40,
    gender: "M",
    hp: 100,
    hpMax: 100,
};

export const eevee: SwitchOptions = {
    species: "eevee",
    level: 50,
    gender: "F",
    hp: 114,
    hpMax: 115,
};

export const castform: SwitchOptions = {
    species: "castform",
    level: 35,
    gender: "N",
    hp: 100,
    hpMax: 100,
};
export const castformrainy: SwitchOptions = {
    ...castform,
    species: "castformrainy",
};
export const castformsnowy: SwitchOptions = {
    ...castform,
    species: "castformsnowy",
};
export const castformsunny: SwitchOptions = {
    ...castform,
    species: "castformsunny",
};

export function requestEvent(
    type: "move",
    sidePokemon: Protocol.Request.Pokemon[],
    active?: Protocol.Request.ActivePokemon,
): Event<"|request|">;
export function requestEvent(
    type: "switch",
    sidePokemon: Protocol.Request.Pokemon[],
): Event<"|request|">;
export function requestEvent(
    type: "move" | "switch",
    sidePokemon: Protocol.Request.Pokemon[],
    active?: Protocol.Request.ActivePokemon,
): Event<"|request|"> {
    return {
        args: [
            "request",
            toRequestJSON({
                ...(type === "move"
                    ? {requestType: "move", active: active ? [active] : []}
                    : {requestType: "switch", forceSwitch: [true]}),
                side: {
                    name: toUsername("username"),
                    id: "p1",
                    pokemon: sidePokemon,
                },
                rqid: 10,
            }),
        ],
        kwArgs: {},
    };
}

export const benchInfo: Protocol.Request.Pokemon[] = [
    {
        active: true,
        details: toDetails(smeargle),
        ident: toIdent("p1", smeargle),
        pokeball: toID("pokeball"),
        ability: toID("owntempo"),
        baseAbility: toID("owntempo"),
        condition: toHPStatus(100, 100),
        item: toID("mail"),
        moves: [toID("tackle"), toID("ember")],
        stats: {atk: 18, def: 29, spa: 18, spd: 36, spe: 58},
        hp: smeargle.hp,
        maxhp: smeargle.hpMax,
        hpcolor: "g",
        name: toSpeciesName(smeargle.species),
        speciesForme: toSpeciesName(smeargle.species),
        level: smeargle.level,
        shiny: true,
        gender: smeargle.gender,
        searchid: toSearchID("p1", smeargle),
    },
    {
        details: toDetails(ditto),
        ident: toIdent("p1", ditto),
        pokeball: toID("pokeball"),
        ability: toID("limber"),
        baseAbility: toID("limber"),
        condition: toHPStatus(100, 100),
        item: toID("mail"),
        moves: [toID("transform")],
        stats: {atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
        hp: ditto.hp,
        maxhp: ditto.hpMax,
        hpcolor: "g",
        name: toSpeciesName(ditto.species),
        speciesForme: toSpeciesName(ditto.species),
        level: ditto.level,
        shiny: true,
        gender: ditto.gender,
        searchid: toSearchID("p1", ditto),
    },
    {
        details: toDetails(eevee),
        ident: toIdent("p1", eevee),
        pokeball: toID("pokeball"),
        ability: toID("runaway"),
        baseAbility: toID("runaway"),
        condition: toHPStatus(115, 115),
        item: toID("mail"),
        moves: [toID("tackle")],
        stats: {atk: 18, def: 29, spa: 18, spd: 36, spe: 58},
        hp: eevee.hp,
        maxhp: eevee.hpMax,
        hpcolor: "g",
        name: toSpeciesName(eevee.species),
        speciesForme: toSpeciesName(eevee.species),
        level: eevee.level,
        shiny: true,
        gender: eevee.gender,
        searchid: toSearchID("p1", eevee),
    },
];
