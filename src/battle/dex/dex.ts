// istanbul ignore file
/**
 * @file Generated file containing all the dex data taken from Pokemon Showdown.
 */
import { Dex, MoveData, PokemonData } from "./dex-util";

const pokemon: {readonly [species: string]: PokemonData} =
{
    Milotic:
    {
        id: 350,
        uid: 0,
        name: "Milotic",
        abilities: ["marvelscale"],
        types: ["water", "???"],
        baseStats: {hp: 95, atk: 60, def: 79, spa: 100, spd: 125, spe: 81},
        weightkg: 162
    },
    "Rotom-Heat":
    {
        id: 479,
        uid: 1,
        name: "Rotom-Heat",
        baseSpecies: "Rotom",
        form: "Heat",
        formLetter: "H",
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    "Rotom-Wash":
    {
        id: 479,
        uid: 2,
        name: "Rotom-Wash",
        baseSpecies: "Rotom",
        form: "Wash",
        formLetter: "W",
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    "Rotom-Frost":
    {
        id: 479,
        uid: 3,
        name: "Rotom-Frost",
        baseSpecies: "Rotom",
        form: "Frost",
        formLetter: "F",
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    "Rotom-Fan":
    {
        id: 479,
        uid: 4,
        name: "Rotom-Fan",
        baseSpecies: "Rotom",
        form: "Fan",
        formLetter: "S",
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    "Rotom-Mow":
    {
        id: 479,
        uid: 5,
        name: "Rotom-Mow",
        baseSpecies: "Rotom",
        form: "Mow",
        formLetter: "C",
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    Butterfree:
    {
        id: 12,
        uid: 6,
        name: "Butterfree",
        abilities: ["compoundeyes"],
        types: ["bug", "flying"],
        baseStats: {hp: 60, atk: 45, def: 50, spa: 80, spd: 80, spe: 70},
        weightkg: 32
    },
    Beedrill:
    {
        id: 15,
        uid: 7,
        name: "Beedrill",
        abilities: ["swarm"],
        types: ["bug", "poison"],
        baseStats: {hp: 65, atk: 80, def: 40, spa: 45, spd: 80, spe: 75},
        weightkg: 29.5
    },
    Pidgeot:
    {
        id: 18,
        uid: 8,
        name: "Pidgeot",
        abilities: ["keeneye", "tangledfeet"],
        types: ["normal", "flying"],
        baseStats: {hp: 83, atk: 80, def: 75, spa: 70, spd: 70, spe: 91},
        weightkg: 39.5
    },
    Pikachu:
    {
        id: 25,
        uid: 9,
        name: "Pikachu",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 35, atk: 55, def: 30, spa: 50, spd: 40, spe: 90},
        weightkg: 6
    },
    Raichu:
    {
        id: 26,
        uid: 10,
        name: "Raichu",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 90, def: 55, spa: 90, spd: 80, spe: 100},
        weightkg: 30
    },
    Nidoqueen:
    {
        id: 31,
        uid: 11,
        name: "Nidoqueen",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "ground"],
        baseStats: {hp: 90, atk: 82, def: 87, spa: 75, spd: 85, spe: 76},
        weightkg: 60
    },
    Nidoking:
    {
        id: 34,
        uid: 12,
        name: "Nidoking",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "ground"],
        baseStats: {hp: 81, atk: 92, def: 77, spa: 85, spd: 75, spe: 85},
        weightkg: 62
    },
    Clefairy:
    {
        id: 35,
        uid: 13,
        name: "Clefairy",
        abilities: ["cutecharm", "magicguard"],
        types: ["normal", "???"],
        baseStats: {hp: 70, atk: 45, def: 48, spa: 60, spd: 65, spe: 35},
        weightkg: 7.5
    },
    Clefable:
    {
        id: 36,
        uid: 14,
        name: "Clefable",
        abilities: ["cutecharm", "magicguard"],
        types: ["normal", "???"],
        baseStats: {hp: 95, atk: 70, def: 73, spa: 85, spd: 90, spe: 60},
        weightkg: 40
    },
    Jigglypuff:
    {
        id: 39,
        uid: 15,
        name: "Jigglypuff",
        abilities: ["cutecharm"],
        types: ["normal", "???"],
        baseStats: {hp: 115, atk: 45, def: 20, spa: 45, spd: 25, spe: 20},
        weightkg: 5.5
    },
    Wigglytuff:
    {
        id: 40,
        uid: 16,
        name: "Wigglytuff",
        abilities: ["cutecharm"],
        types: ["normal", "???"],
        baseStats: {hp: 140, atk: 70, def: 45, spa: 75, spd: 50, spe: 45},
        weightkg: 12
    },
    Vileplume:
    {
        id: 45,
        uid: 17,
        name: "Vileplume",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 75, atk: 80, def: 85, spa: 100, spd: 90, spe: 50},
        weightkg: 18.6
    },
    Poliwrath:
    {
        id: 62,
        uid: 18,
        name: "Poliwrath",
        abilities: ["waterabsorb", "damp"],
        types: ["water", "fighting"],
        baseStats: {hp: 90, atk: 85, def: 95, spa: 70, spd: 90, spe: 70},
        weightkg: 54
    },
    Alakazam:
    {
        id: 65,
        uid: 19,
        name: "Alakazam",
        abilities: ["synchronize", "innerfocus"],
        types: ["psychic", "???"],
        baseStats: {hp: 55, atk: 50, def: 45, spa: 135, spd: 85, spe: 120},
        weightkg: 48
    },
    Victreebel:
    {
        id: 71,
        uid: 20,
        name: "Victreebel",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 80, atk: 105, def: 65, spa: 100, spd: 60, spe: 70},
        weightkg: 15.5
    },
    Golem:
    {
        id: 76,
        uid: 21,
        name: "Golem",
        abilities: ["rockhead", "sturdy"],
        types: ["rock", "ground"],
        baseStats: {hp: 80, atk: 110, def: 130, spa: 55, spd: 65, spe: 45},
        weightkg: 300
    },
    "Mr. Mime":
    {
        id: 122,
        uid: 22,
        name: "Mr. Mime",
        abilities: ["soundproof", "filter"],
        types: ["psychic", "???"],
        baseStats: {hp: 40, atk: 45, def: 65, spa: 100, spd: 120, spe: 90},
        weightkg: 54.5
    },
    Articuno:
    {
        id: 144,
        uid: 23,
        name: "Articuno",
        abilities: ["pressure"],
        types: ["ice", "flying"],
        baseStats: {hp: 90, atk: 85, def: 100, spa: 95, spd: 125, spe: 85},
        weightkg: 55.4
    },
    Zapdos:
    {
        id: 145,
        uid: 24,
        name: "Zapdos",
        abilities: ["pressure"],
        types: ["electric", "flying"],
        baseStats: {hp: 90, atk: 90, def: 85, spa: 125, spd: 90, spe: 100},
        weightkg: 52.6
    },
    Moltres:
    {
        id: 146,
        uid: 25,
        name: "Moltres",
        abilities: ["pressure"],
        types: ["fire", "flying"],
        baseStats: {hp: 90, atk: 100, def: 90, spa: 125, spd: 85, spe: 90},
        weightkg: 60
    },
    Chikorita:
    {
        id: 152,
        uid: 26,
        name: "Chikorita",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 45, atk: 49, def: 65, spa: 49, spd: 65, spe: 45},
        weightkg: 6.4
    },
    Bayleef:
    {
        id: 153,
        uid: 27,
        name: "Bayleef",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 60, atk: 62, def: 80, spa: 63, spd: 80, spe: 60},
        weightkg: 15.8
    },
    Meganium:
    {
        id: 154,
        uid: 28,
        name: "Meganium",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 80, atk: 82, def: 100, spa: 83, spd: 100, spe: 80},
        weightkg: 100.5
    },
    Cyndaquil:
    {
        id: 155,
        uid: 29,
        name: "Cyndaquil",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65},
        weightkg: 7.9
    },
    Quilava:
    {
        id: 156,
        uid: 30,
        name: "Quilava",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80},
        weightkg: 19
    },
    Typhlosion:
    {
        id: 157,
        uid: 31,
        name: "Typhlosion",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100},
        weightkg: 79.5
    },
    Totodile:
    {
        id: 158,
        uid: 32,
        name: "Totodile",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 50, atk: 65, def: 64, spa: 44, spd: 48, spe: 43},
        weightkg: 9.5
    },
    Croconaw:
    {
        id: 159,
        uid: 33,
        name: "Croconaw",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 65, atk: 80, def: 80, spa: 59, spd: 63, spe: 58},
        weightkg: 25
    },
    Feraligatr:
    {
        id: 160,
        uid: 34,
        name: "Feraligatr",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 85, atk: 105, def: 100, spa: 79, spd: 83, spe: 78},
        weightkg: 88.8
    },
    Igglybuff:
    {
        id: 174,
        uid: 35,
        name: "Igglybuff",
        abilities: ["cutecharm"],
        types: ["normal", "???"],
        baseStats: {hp: 90, atk: 30, def: 15, spa: 40, spd: 20, spe: 15},
        weightkg: 1
    },
    Togepi:
    {
        id: 175,
        uid: 36,
        name: "Togepi",
        abilities: ["hustle", "serenegrace"],
        types: ["normal", "???"],
        baseStats: {hp: 35, atk: 20, def: 65, spa: 40, spd: 65, spe: 20},
        weightkg: 1.5
    },
    Togetic:
    {
        id: 176,
        uid: 37,
        name: "Togetic",
        abilities: ["hustle", "serenegrace"],
        types: ["normal", "flying"],
        baseStats: {hp: 55, atk: 40, def: 85, spa: 80, spd: 105, spe: 40},
        weightkg: 3.2
    },
    Cleffa:
    {
        id: 173,
        uid: 38,
        name: "Cleffa",
        abilities: ["cutecharm", "magicguard"],
        types: ["normal", "???"],
        baseStats: {hp: 50, atk: 25, def: 28, spa: 45, spd: 55, spe: 15},
        weightkg: 3
    },
    Ampharos:
    {
        id: 181,
        uid: 39,
        name: "Ampharos",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 90, atk: 75, def: 75, spa: 115, spd: 90, spe: 55},
        weightkg: 61.5
    },
    Bellossom:
    {
        id: 182,
        uid: 40,
        name: "Bellossom",
        abilities: ["chlorophyll"],
        types: ["grass", "???"],
        baseStats: {hp: 75, atk: 80, def: 85, spa: 90, spd: 100, spe: 50},
        weightkg: 5.8
    },
    Marill:
    {
        id: 183,
        uid: 41,
        name: "Marill",
        abilities: ["thickfat", "hugepower"],
        types: ["water", "???"],
        baseStats: {hp: 70, atk: 20, def: 50, spa: 20, spd: 50, spe: 40},
        weightkg: 8.5
    },
    Azumarill:
    {
        id: 184,
        uid: 42,
        name: "Azumarill",
        abilities: ["thickfat", "hugepower"],
        types: ["water", "???"],
        baseStats: {hp: 100, atk: 50, def: 80, spa: 50, spd: 80, spe: 50},
        weightkg: 28.5
    },
    Jumpluff:
    {
        id: 189,
        uid: 43,
        name: "Jumpluff",
        abilities: ["chlorophyll", "leafguard"],
        types: ["grass", "flying"],
        baseStats: {hp: 75, atk: 55, def: 70, spa: 55, spd: 85, spe: 110},
        weightkg: 3
    },
    Snubbull:
    {
        id: 209,
        uid: 44,
        name: "Snubbull",
        abilities: ["intimidate", "runaway"],
        types: ["normal", "???"],
        baseStats: {hp: 60, atk: 80, def: 50, spa: 40, spd: 40, spe: 30},
        weightkg: 7.8
    },
    Granbull:
    {
        id: 210,
        uid: 45,
        name: "Granbull",
        abilities: ["intimidate", "quickfeet"],
        types: ["normal", "???"],
        baseStats: {hp: 90, atk: 120, def: 75, spa: 60, spd: 60, spe: 45},
        weightkg: 48.7
    },
    Raikou:
    {
        id: 243,
        uid: 46,
        name: "Raikou",
        abilities: ["pressure"],
        types: ["electric", "???"],
        baseStats: {hp: 90, atk: 85, def: 75, spa: 115, spd: 100, spe: 115},
        weightkg: 178
    },
    Entei:
    {
        id: 244,
        uid: 47,
        name: "Entei",
        abilities: ["pressure"],
        types: ["fire", "???"],
        baseStats: {hp: 115, atk: 115, def: 85, spa: 90, spd: 75, spe: 100},
        weightkg: 198
    },
    Suicune:
    {
        id: 245,
        uid: 48,
        name: "Suicune",
        abilities: ["pressure"],
        types: ["water", "???"],
        baseStats: {hp: 100, atk: 75, def: 115, spa: 90, spd: 115, spe: 85},
        weightkg: 187
    },
    Beautifly:
    {
        id: 267,
        uid: 49,
        name: "Beautifly",
        abilities: ["swarm"],
        types: ["bug", "flying"],
        baseStats: {hp: 60, atk: 70, def: 50, spa: 90, spd: 50, spe: 65},
        weightkg: 28.4
    },
    Ralts:
    {
        id: 280,
        uid: 50,
        name: "Ralts",
        abilities: ["synchronize", "trace"],
        types: ["psychic", "???"],
        baseStats: {hp: 28, atk: 25, def: 25, spa: 45, spd: 35, spe: 40},
        weightkg: 6.6
    },
    Kirlia:
    {
        id: 281,
        uid: 51,
        name: "Kirlia",
        abilities: ["synchronize", "trace"],
        types: ["psychic", "???"],
        baseStats: {hp: 38, atk: 35, def: 35, spa: 65, spd: 55, spe: 50},
        weightkg: 20.2
    },
    Gardevoir:
    {
        id: 282,
        uid: 52,
        name: "Gardevoir",
        abilities: ["synchronize", "trace"],
        types: ["psychic", "???"],
        baseStats: {hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80},
        weightkg: 48.4
    },
    Exploud:
    {
        id: 295,
        uid: 53,
        name: "Exploud",
        abilities: ["soundproof"],
        types: ["normal", "???"],
        baseStats: {hp: 104, atk: 91, def: 63, spa: 91, spd: 63, spe: 68},
        weightkg: 84
    },
    Azurill:
    {
        id: 298,
        uid: 54,
        name: "Azurill",
        abilities: ["thickfat", "hugepower"],
        types: ["normal", "???"],
        baseStats: {hp: 50, atk: 20, def: 40, spa: 20, spd: 40, spe: 20},
        weightkg: 2
    },
    Mawile:
    {
        id: 303,
        uid: 55,
        name: "Mawile",
        abilities: ["hypercutter", "intimidate"],
        types: ["steel", "???"],
        baseStats: {hp: 50, atk: 85, def: 85, spa: 55, spd: 55, spe: 50},
        weightkg: 11.5
    },
    Plusle:
    {
        id: 311,
        uid: 56,
        name: "Plusle",
        abilities: ["plus"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 50, def: 40, spa: 85, spd: 75, spe: 95},
        weightkg: 4.2
    },
    Minun:
    {
        id: 312,
        uid: 57,
        name: "Minun",
        abilities: ["minus"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 40, def: 50, spa: 75, spd: 85, spe: 95},
        weightkg: 4.2
    },
    Kecleon:
    {
        id: 352,
        uid: 58,
        name: "Kecleon",
        abilities: ["colorchange"],
        types: ["normal", "???"],
        baseStats: {hp: 60, atk: 90, def: 70, spa: 60, spd: 120, spe: 40},
        weightkg: 22
    },
    Duskull:
    {
        id: 355,
        uid: 59,
        name: "Duskull",
        abilities: ["levitate"],
        types: ["ghost", "???"],
        baseStats: {hp: 20, atk: 40, def: 90, spa: 30, spd: 90, spe: 25},
        weightkg: 15
    },
    Dusclops:
    {
        id: 356,
        uid: 60,
        name: "Dusclops",
        abilities: ["pressure"],
        types: ["ghost", "???"],
        baseStats: {hp: 40, atk: 70, def: 130, spa: 60, spd: 130, spe: 25},
        weightkg: 30.6
    },
    Regirock:
    {
        id: 377,
        uid: 61,
        name: "Regirock",
        abilities: ["clearbody"],
        types: ["rock", "???"],
        baseStats: {hp: 80, atk: 100, def: 200, spa: 50, spd: 100, spe: 50},
        weightkg: 230
    },
    Regice:
    {
        id: 378,
        uid: 62,
        name: "Regice",
        abilities: ["clearbody"],
        types: ["ice", "???"],
        baseStats: {hp: 80, atk: 50, def: 100, spa: 100, spd: 200, spe: 50},
        weightkg: 175
    },
    Registeel:
    {
        id: 379,
        uid: 63,
        name: "Registeel",
        abilities: ["clearbody"],
        types: ["steel", "???"],
        baseStats: {hp: 80, atk: 75, def: 150, spa: 75, spd: 150, spe: 50},
        weightkg: 205
    },
    Starly:
    {
        id: 396,
        uid: 64,
        name: "Starly",
        abilities: ["keeneye"],
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 60},
        weightkg: 2
    },
    Staraptor:
    {
        id: 398,
        uid: 65,
        name: "Staraptor",
        abilities: ["intimidate"],
        types: ["normal", "flying"],
        baseStats: {hp: 85, atk: 120, def: 70, spa: 50, spd: 50, spe: 100},
        weightkg: 24.9
    },
    Roserade:
    {
        id: 407,
        uid: 66,
        name: "Roserade",
        abilities: ["naturalcure", "poisonpoint"],
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 70, def: 55, spa: 125, spd: 105, spe: 90},
        weightkg: 14.5
    },
    "Mime Jr.":
    {
        id: 439,
        uid: 67,
        name: "Mime Jr.",
        abilities: ["soundproof", "filter"],
        types: ["psychic", "???"],
        baseStats: {hp: 20, atk: 25, def: 45, spa: 70, spd: 90, spe: 60},
        weightkg: 13
    },
    Togekiss:
    {
        id: 468,
        uid: 68,
        name: "Togekiss",
        abilities: ["hustle", "serenegrace"],
        types: ["normal", "flying"],
        baseStats: {hp: 85, atk: 50, def: 95, spa: 120, spd: 115, spe: 80},
        weightkg: 38
    },
    Dusknoir:
    {
        id: 477,
        uid: 69,
        name: "Dusknoir",
        abilities: ["pressure"],
        types: ["ghost", "???"],
        baseStats: {hp: 45, atk: 100, def: 135, spa: 65, spd: 135, spe: 45},
        weightkg: 106.6
    },
    Heatran:
    {
        id: 485,
        uid: 70,
        name: "Heatran",
        abilities: ["flashfire"],
        types: ["fire", "steel"],
        baseStats: {hp: 91, atk: 90, def: 106, spa: 130, spd: 106, spe: 77},
        weightkg: 430
    },
    Arbok:
    {
        id: 24,
        uid: 71,
        name: "Arbok",
        abilities: ["intimidate", "shedskin"],
        types: ["poison", "???"],
        baseStats: {hp: 60, atk: 85, def: 69, spa: 65, spd: 79, spe: 80},
        weightkg: 65
    },
    Dugtrio:
    {
        id: 51,
        uid: 72,
        name: "Dugtrio",
        abilities: ["sandveil", "arenatrap"],
        types: ["ground", "???"],
        baseStats: {hp: 35, atk: 80, def: 50, spa: 50, spd: 70, spe: 120},
        weightkg: 33.3
    },
    "Farfetch'd":
    {
        id: 83,
        uid: 73,
        name: "Farfetch'd",
        abilities: ["keeneye", "innerfocus"],
        types: ["normal", "flying"],
        baseStats: {hp: 52, atk: 65, def: 55, spa: 58, spd: 62, spe: 60},
        weightkg: 15
    },
    Dodrio:
    {
        id: 85,
        uid: 74,
        name: "Dodrio",
        abilities: ["runaway", "earlybird"],
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 110, def: 70, spa: 60, spd: 60, spe: 100},
        weightkg: 85.2
    },
    Gengar:
    {
        id: 94,
        uid: 75,
        name: "Gengar",
        abilities: ["levitate"],
        types: ["ghost", "poison"],
        baseStats: {hp: 60, atk: 65, def: 60, spa: 130, spd: 75, spe: 110},
        weightkg: 40.5
    },
    Electrode:
    {
        id: 101,
        uid: 76,
        name: "Electrode",
        abilities: ["soundproof", "static"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 50, def: 70, spa: 80, spd: 80, spe: 140},
        weightkg: 66.6
    },
    Exeggutor:
    {
        id: 103,
        uid: 77,
        name: "Exeggutor",
        abilities: ["chlorophyll"],
        types: ["grass", "psychic"],
        baseStats: {hp: 95, atk: 95, def: 85, spa: 125, spd: 65, spe: 55},
        weightkg: 120
    },
    Noctowl:
    {
        id: 164,
        uid: 78,
        name: "Noctowl",
        abilities: ["insomnia", "keeneye"],
        types: ["normal", "flying"],
        baseStats: {hp: 100, atk: 50, def: 50, spa: 76, spd: 96, spe: 70},
        weightkg: 40.8
    },
    Ariados:
    {
        id: 168,
        uid: 79,
        name: "Ariados",
        abilities: ["swarm", "insomnia"],
        types: ["bug", "poison"],
        baseStats: {hp: 70, atk: 90, def: 70, spa: 60, spd: 60, spe: 40},
        weightkg: 33.5
    },
    Qwilfish:
    {
        id: 211,
        uid: 80,
        name: "Qwilfish",
        abilities: ["poisonpoint", "swiftswim"],
        types: ["water", "poison"],
        baseStats: {hp: 65, atk: 95, def: 75, spa: 55, spd: 55, spe: 85},
        weightkg: 3.9
    },
    Magcargo:
    {
        id: 219,
        uid: 81,
        name: "Magcargo",
        abilities: ["magmaarmor", "flamebody"],
        types: ["fire", "rock"],
        baseStats: {hp: 50, atk: 50, def: 120, spa: 80, spd: 80, spe: 30},
        weightkg: 55
    },
    Corsola:
    {
        id: 222,
        uid: 82,
        name: "Corsola",
        abilities: ["hustle", "naturalcure"],
        types: ["water", "rock"],
        baseStats: {hp: 55, atk: 55, def: 85, spa: 65, spd: 85, spe: 35},
        weightkg: 5
    },
    Mantine:
    {
        id: 226,
        uid: 83,
        name: "Mantine",
        abilities: ["swiftswim", "waterabsorb"],
        types: ["water", "flying"],
        baseStats: {hp: 65, atk: 40, def: 70, spa: 80, spd: 140, spe: 70},
        weightkg: 220
    },
    Swellow:
    {
        id: 277,
        uid: 84,
        name: "Swellow",
        abilities: ["guts"],
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 85, def: 60, spa: 50, spd: 50, spe: 125},
        weightkg: 19.8
    },
    Wingull:
    {
        id: 278,
        uid: 85,
        name: "Wingull",
        abilities: ["keeneye"],
        types: ["water", "flying"],
        baseStats: {hp: 40, atk: 30, def: 30, spa: 55, spd: 30, spe: 85},
        weightkg: 9.5
    },
    Pelipper:
    {
        id: 279,
        uid: 86,
        name: "Pelipper",
        abilities: ["keeneye"],
        types: ["water", "flying"],
        baseStats: {hp: 60, atk: 50, def: 100, spa: 85, spd: 70, spe: 65},
        weightkg: 28
    },
    Masquerain:
    {
        id: 284,
        uid: 87,
        name: "Masquerain",
        abilities: ["intimidate"],
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 60, def: 62, spa: 80, spd: 82, spe: 60},
        weightkg: 3.6
    },
    Delcatty:
    {
        id: 301,
        uid: 88,
        name: "Delcatty",
        abilities: ["cutecharm", "normalize"],
        types: ["normal", "???"],
        baseStats: {hp: 70, atk: 65, def: 65, spa: 55, spd: 55, spe: 70},
        weightkg: 32.6
    },
    Volbeat:
    {
        id: 313,
        uid: 89,
        name: "Volbeat",
        abilities: ["illuminate", "swarm"],
        types: ["bug", "???"],
        baseStats: {hp: 65, atk: 73, def: 55, spa: 47, spd: 75, spe: 85},
        weightkg: 17.7
    },
    Illumise:
    {
        id: 314,
        uid: 90,
        name: "Illumise",
        abilities: ["oblivious", "tintedlens"],
        types: ["bug", "???"],
        baseStats: {hp: 65, atk: 47, def: 55, spa: 73, spd: 75, spe: 85},
        weightkg: 17.7
    },
    Torkoal:
    {
        id: 324,
        uid: 91,
        name: "Torkoal",
        abilities: ["whitesmoke"],
        types: ["fire", "???"],
        baseStats: {hp: 70, atk: 85, def: 140, spa: 85, spd: 70, spe: 20},
        weightkg: 80.4
    },
    Lunatone:
    {
        id: 337,
        uid: 92,
        name: "Lunatone",
        abilities: ["levitate"],
        types: ["rock", "psychic"],
        baseStats: {hp: 70, atk: 55, def: 65, spa: 95, spd: 85, spe: 70},
        weightkg: 168
    },
    Solrock:
    {
        id: 338,
        uid: 93,
        name: "Solrock",
        abilities: ["levitate"],
        types: ["rock", "psychic"],
        baseStats: {hp: 70, atk: 95, def: 85, spa: 55, spd: 65, spe: 70},
        weightkg: 154
    },
    Castform:
    {
        id: 351,
        uid: 94,
        name: "Castform",
        otherForms: ["castformsunny", "castformrainy", "castformsnowy"],
        abilities: ["forecast"],
        types: ["normal", "???"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    "Castform-Sunny":
    {
        id: 351,
        uid: 95,
        name: "Castform-Sunny",
        baseSpecies: "Castform",
        form: "Sunny",
        formLetter: "S",
        abilities: ["forecast"],
        types: ["fire", "???"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    "Castform-Rainy":
    {
        id: 351,
        uid: 96,
        name: "Castform-Rainy",
        baseSpecies: "Castform",
        form: "Rainy",
        formLetter: "R",
        abilities: ["forecast"],
        types: ["water", "???"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    Chimecho:
    {
        id: 358,
        uid: 97,
        name: "Chimecho",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 65, atk: 50, def: 70, spa: 95, spd: 80, spe: 65},
        weightkg: 1
    },
    Burmy:
    {
        id: 412,
        uid: 98,
        name: "Burmy",
        baseForm: "Plant",
        abilities: ["shedskin"],
        types: ["bug", "???"],
        baseStats: {hp: 40, atk: 29, def: 45, spa: 29, spd: 45, spe: 36},
        weightkg: 3.4
    },
    Wormadam:
    {
        id: 413,
        uid: 99,
        name: "Wormadam",
        baseForm: "Plant",
        otherForms: ["wormadamsandy", "wormadamtrash"],
        abilities: ["anticipation"],
        types: ["bug", "grass"],
        baseStats: {hp: 60, atk: 59, def: 85, spa: 79, spd: 105, spe: 36},
        weightkg: 6.5
    },
    "Wormadam-Sandy":
    {
        id: 413,
        uid: 100,
        name: "Wormadam-Sandy",
        baseSpecies: "Wormadam",
        form: "Sandy",
        formLetter: "G",
        abilities: ["anticipation"],
        types: ["bug", "ground"],
        baseStats: {hp: 60, atk: 79, def: 105, spa: 59, spd: 85, spe: 36},
        weightkg: 6.5
    },
    "Wormadam-Trash":
    {
        id: 413,
        uid: 101,
        name: "Wormadam-Trash",
        baseSpecies: "Wormadam",
        form: "Trash",
        formLetter: "S",
        abilities: ["anticipation"],
        types: ["bug", "steel"],
        baseStats: {hp: 60, atk: 69, def: 95, spa: 69, spd: 95, spe: 36},
        weightkg: 6.5
    },
    Cherrim:
    {
        id: 421,
        uid: 102,
        name: "Cherrim",
        baseForm: "Overcast",
        otherForms: ["cherrimsunshine"],
        abilities: ["flowergift"],
        types: ["grass", "???"],
        baseStats: {hp: 70, atk: 60, def: 70, spa: 87, spd: 78, spe: 85},
        weightkg: 9.3
    },
    Arceus:
    {
        id: 493,
        uid: 103,
        name: "Arceus",
        baseForm: "Normal",
        otherForms: ["arceusbug", "arceusdark", "arceusdragon", "arceuselectric", "arceusfighting", "arceusfire", "arceusflying", "arceusghost", "arceusgrass", "arceusground", "arceusice", "arceuspoison", "arceuspsychic", "arceusrock", "arceussteel", "arceuswater"],
        abilities: ["multitype"],
        types: ["normal", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    Bulbasaur:
    {
        id: 1,
        uid: 104,
        name: "Bulbasaur",
        abilities: ["overgrow"],
        types: ["grass", "poison"],
        baseStats: {hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45},
        weightkg: 6.9
    },
    Ivysaur:
    {
        id: 2,
        uid: 105,
        name: "Ivysaur",
        abilities: ["overgrow"],
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 62, def: 63, spa: 80, spd: 80, spe: 60},
        weightkg: 13
    },
    Venusaur:
    {
        id: 3,
        uid: 106,
        name: "Venusaur",
        abilities: ["overgrow"],
        types: ["grass", "poison"],
        baseStats: {hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80},
        weightkg: 100
    },
    Charmander:
    {
        id: 4,
        uid: 107,
        name: "Charmander",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65},
        weightkg: 8.5
    },
    Charmeleon:
    {
        id: 5,
        uid: 108,
        name: "Charmeleon",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80},
        weightkg: 19
    },
    Charizard:
    {
        id: 6,
        uid: 109,
        name: "Charizard",
        abilities: ["blaze"],
        types: ["fire", "flying"],
        baseStats: {hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100},
        weightkg: 90.5
    },
    Squirtle:
    {
        id: 7,
        uid: 110,
        name: "Squirtle",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43},
        weightkg: 9
    },
    Wartortle:
    {
        id: 8,
        uid: 111,
        name: "Wartortle",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 59, atk: 63, def: 80, spa: 65, spd: 80, spe: 58},
        weightkg: 22.5
    },
    Blastoise:
    {
        id: 9,
        uid: 112,
        name: "Blastoise",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78},
        weightkg: 85.5
    },
    Caterpie:
    {
        id: 10,
        uid: 113,
        name: "Caterpie",
        abilities: ["shielddust"],
        types: ["bug", "???"],
        baseStats: {hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45},
        weightkg: 2.9
    },
    Metapod:
    {
        id: 11,
        uid: 114,
        name: "Metapod",
        abilities: ["shedskin"],
        types: ["bug", "???"],
        baseStats: {hp: 50, atk: 20, def: 55, spa: 25, spd: 25, spe: 30},
        weightkg: 9.9
    },
    Weedle:
    {
        id: 13,
        uid: 115,
        name: "Weedle",
        abilities: ["shielddust"],
        types: ["bug", "poison"],
        baseStats: {hp: 40, atk: 35, def: 30, spa: 20, spd: 20, spe: 50},
        weightkg: 3.2
    },
    Kakuna:
    {
        id: 14,
        uid: 116,
        name: "Kakuna",
        abilities: ["shedskin"],
        types: ["bug", "poison"],
        baseStats: {hp: 45, atk: 25, def: 50, spa: 25, spd: 25, spe: 35},
        weightkg: 10
    },
    Pidgey:
    {
        id: 16,
        uid: 117,
        name: "Pidgey",
        abilities: ["keeneye", "tangledfeet"],
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56},
        weightkg: 1.8
    },
    Pidgeotto:
    {
        id: 17,
        uid: 118,
        name: "Pidgeotto",
        abilities: ["keeneye", "tangledfeet"],
        types: ["normal", "flying"],
        baseStats: {hp: 63, atk: 60, def: 55, spa: 50, spd: 50, spe: 71},
        weightkg: 30
    },
    Rattata:
    {
        id: 19,
        uid: 119,
        name: "Rattata",
        abilities: ["runaway", "guts"],
        types: ["normal", "???"],
        baseStats: {hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72},
        weightkg: 3.5
    },
    Raticate:
    {
        id: 20,
        uid: 120,
        name: "Raticate",
        abilities: ["runaway", "guts"],
        types: ["normal", "???"],
        baseStats: {hp: 55, atk: 81, def: 60, spa: 50, spd: 70, spe: 97},
        weightkg: 18.5
    },
    Spearow:
    {
        id: 21,
        uid: 121,
        name: "Spearow",
        abilities: ["keeneye"],
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 60, def: 30, spa: 31, spd: 31, spe: 70},
        weightkg: 2
    },
    Fearow:
    {
        id: 22,
        uid: 122,
        name: "Fearow",
        abilities: ["keeneye"],
        types: ["normal", "flying"],
        baseStats: {hp: 65, atk: 90, def: 65, spa: 61, spd: 61, spe: 100},
        weightkg: 38
    },
    Ekans:
    {
        id: 23,
        uid: 123,
        name: "Ekans",
        abilities: ["intimidate", "shedskin"],
        types: ["poison", "???"],
        baseStats: {hp: 35, atk: 60, def: 44, spa: 40, spd: 54, spe: 55},
        weightkg: 6.9
    },
    Sandshrew:
    {
        id: 27,
        uid: 124,
        name: "Sandshrew",
        abilities: ["sandveil"],
        types: ["ground", "???"],
        baseStats: {hp: 50, atk: 75, def: 85, spa: 20, spd: 30, spe: 40},
        weightkg: 12
    },
    Sandslash:
    {
        id: 28,
        uid: 125,
        name: "Sandslash",
        abilities: ["sandveil"],
        types: ["ground", "???"],
        baseStats: {hp: 75, atk: 100, def: 110, spa: 45, spd: 55, spe: 65},
        weightkg: 29.5
    },
    "Nidoran-F":
    {
        id: 29,
        uid: 126,
        name: "Nidoran-F",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "???"],
        baseStats: {hp: 55, atk: 47, def: 52, spa: 40, spd: 40, spe: 41},
        weightkg: 7
    },
    Nidorina:
    {
        id: 30,
        uid: 127,
        name: "Nidorina",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "???"],
        baseStats: {hp: 70, atk: 62, def: 67, spa: 55, spd: 55, spe: 56},
        weightkg: 20
    },
    "Nidoran-M":
    {
        id: 32,
        uid: 128,
        name: "Nidoran-M",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "???"],
        baseStats: {hp: 46, atk: 57, def: 40, spa: 40, spd: 40, spe: 50},
        weightkg: 9
    },
    Nidorino:
    {
        id: 33,
        uid: 129,
        name: "Nidorino",
        abilities: ["poisonpoint", "rivalry"],
        types: ["poison", "???"],
        baseStats: {hp: 61, atk: 72, def: 57, spa: 55, spd: 55, spe: 65},
        weightkg: 19.5
    },
    Vulpix:
    {
        id: 37,
        uid: 130,
        name: "Vulpix",
        abilities: ["flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 38, atk: 41, def: 40, spa: 50, spd: 65, spe: 65},
        weightkg: 9.9
    },
    Ninetales:
    {
        id: 38,
        uid: 131,
        name: "Ninetales",
        abilities: ["flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 73, atk: 76, def: 75, spa: 81, spd: 100, spe: 100},
        weightkg: 19.9
    },
    Zubat:
    {
        id: 41,
        uid: 132,
        name: "Zubat",
        abilities: ["innerfocus"],
        types: ["poison", "flying"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 30, spd: 40, spe: 55},
        weightkg: 7.5
    },
    Golbat:
    {
        id: 42,
        uid: 133,
        name: "Golbat",
        abilities: ["innerfocus"],
        types: ["poison", "flying"],
        baseStats: {hp: 75, atk: 80, def: 70, spa: 65, spd: 75, spe: 90},
        weightkg: 55
    },
    Oddish:
    {
        id: 43,
        uid: 134,
        name: "Oddish",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 45, atk: 50, def: 55, spa: 75, spd: 65, spe: 30},
        weightkg: 5.4
    },
    Gloom:
    {
        id: 44,
        uid: 135,
        name: "Gloom",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 65, def: 70, spa: 85, spd: 75, spe: 40},
        weightkg: 8.6
    },
    Paras:
    {
        id: 46,
        uid: 136,
        name: "Paras",
        abilities: ["effectspore", "dryskin"],
        types: ["bug", "grass"],
        baseStats: {hp: 35, atk: 70, def: 55, spa: 45, spd: 55, spe: 25},
        weightkg: 5.4
    },
    Parasect:
    {
        id: 47,
        uid: 137,
        name: "Parasect",
        abilities: ["effectspore", "dryskin"],
        types: ["bug", "grass"],
        baseStats: {hp: 60, atk: 95, def: 80, spa: 60, spd: 80, spe: 30},
        weightkg: 29.5
    },
    Venonat:
    {
        id: 48,
        uid: 138,
        name: "Venonat",
        abilities: ["compoundeyes", "tintedlens"],
        types: ["bug", "poison"],
        baseStats: {hp: 60, atk: 55, def: 50, spa: 40, spd: 55, spe: 45},
        weightkg: 30
    },
    Venomoth:
    {
        id: 49,
        uid: 139,
        name: "Venomoth",
        abilities: ["shielddust", "tintedlens"],
        types: ["bug", "poison"],
        baseStats: {hp: 70, atk: 65, def: 60, spa: 90, spd: 75, spe: 90},
        weightkg: 12.5
    },
    Diglett:
    {
        id: 50,
        uid: 140,
        name: "Diglett",
        abilities: ["sandveil", "arenatrap"],
        types: ["ground", "???"],
        baseStats: {hp: 10, atk: 55, def: 25, spa: 35, spd: 45, spe: 95},
        weightkg: 0.8
    },
    Meowth:
    {
        id: 52,
        uid: 141,
        name: "Meowth",
        abilities: ["pickup", "technician"],
        types: ["normal", "???"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 40, spd: 40, spe: 90},
        weightkg: 4.2
    },
    Persian:
    {
        id: 53,
        uid: 142,
        name: "Persian",
        abilities: ["limber", "technician"],
        types: ["normal", "???"],
        baseStats: {hp: 65, atk: 70, def: 60, spa: 65, spd: 65, spe: 115},
        weightkg: 32
    },
    Psyduck:
    {
        id: 54,
        uid: 143,
        name: "Psyduck",
        abilities: ["damp", "cloudnine"],
        types: ["water", "???"],
        baseStats: {hp: 50, atk: 52, def: 48, spa: 65, spd: 50, spe: 55},
        weightkg: 19.6
    },
    Golduck:
    {
        id: 55,
        uid: 144,
        name: "Golduck",
        abilities: ["damp", "cloudnine"],
        types: ["water", "???"],
        baseStats: {hp: 80, atk: 82, def: 78, spa: 95, spd: 80, spe: 85},
        weightkg: 76.6
    },
    Mankey:
    {
        id: 56,
        uid: 145,
        name: "Mankey",
        abilities: ["vitalspirit", "angerpoint"],
        types: ["fighting", "???"],
        baseStats: {hp: 40, atk: 80, def: 35, spa: 35, spd: 45, spe: 70},
        weightkg: 28
    },
    Primeape:
    {
        id: 57,
        uid: 146,
        name: "Primeape",
        abilities: ["vitalspirit", "angerpoint"],
        types: ["fighting", "???"],
        baseStats: {hp: 65, atk: 105, def: 60, spa: 60, spd: 70, spe: 95},
        weightkg: 32
    },
    Growlithe:
    {
        id: 58,
        uid: 147,
        name: "Growlithe",
        abilities: ["intimidate", "flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 55, atk: 70, def: 45, spa: 70, spd: 50, spe: 60},
        weightkg: 19
    },
    Arcanine:
    {
        id: 59,
        uid: 148,
        name: "Arcanine",
        abilities: ["intimidate", "flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 90, atk: 110, def: 80, spa: 100, spd: 80, spe: 95},
        weightkg: 155
    },
    Poliwag:
    {
        id: 60,
        uid: 149,
        name: "Poliwag",
        abilities: ["waterabsorb", "damp"],
        types: ["water", "???"],
        baseStats: {hp: 40, atk: 50, def: 40, spa: 40, spd: 40, spe: 90},
        weightkg: 12.4
    },
    Poliwhirl:
    {
        id: 61,
        uid: 150,
        name: "Poliwhirl",
        abilities: ["waterabsorb", "damp"],
        types: ["water", "???"],
        baseStats: {hp: 65, atk: 65, def: 65, spa: 50, spd: 50, spe: 90},
        weightkg: 20
    },
    Abra:
    {
        id: 63,
        uid: 151,
        name: "Abra",
        abilities: ["synchronize", "innerfocus"],
        types: ["psychic", "???"],
        baseStats: {hp: 25, atk: 20, def: 15, spa: 105, spd: 55, spe: 90},
        weightkg: 19.5
    },
    Kadabra:
    {
        id: 64,
        uid: 152,
        name: "Kadabra",
        abilities: ["synchronize", "innerfocus"],
        types: ["psychic", "???"],
        baseStats: {hp: 40, atk: 35, def: 30, spa: 120, spd: 70, spe: 105},
        weightkg: 56.5
    },
    Machop:
    {
        id: 66,
        uid: 153,
        name: "Machop",
        abilities: ["guts", "noguard"],
        types: ["fighting", "???"],
        baseStats: {hp: 70, atk: 80, def: 50, spa: 35, spd: 35, spe: 35},
        weightkg: 19.5
    },
    Machoke:
    {
        id: 67,
        uid: 154,
        name: "Machoke",
        abilities: ["guts", "noguard"],
        types: ["fighting", "???"],
        baseStats: {hp: 80, atk: 100, def: 70, spa: 50, spd: 60, spe: 45},
        weightkg: 70.5
    },
    Machamp:
    {
        id: 68,
        uid: 155,
        name: "Machamp",
        abilities: ["guts", "noguard"],
        types: ["fighting", "???"],
        baseStats: {hp: 90, atk: 130, def: 80, spa: 65, spd: 85, spe: 55},
        weightkg: 130
    },
    Bellsprout:
    {
        id: 69,
        uid: 156,
        name: "Bellsprout",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 50, atk: 75, def: 35, spa: 70, spd: 30, spe: 40},
        weightkg: 4
    },
    Weepinbell:
    {
        id: 70,
        uid: 157,
        name: "Weepinbell",
        abilities: ["chlorophyll"],
        types: ["grass", "poison"],
        baseStats: {hp: 65, atk: 90, def: 50, spa: 85, spd: 45, spe: 55},
        weightkg: 6.4
    },
    Tentacool:
    {
        id: 72,
        uid: 158,
        name: "Tentacool",
        abilities: ["clearbody", "liquidooze"],
        types: ["water", "poison"],
        baseStats: {hp: 40, atk: 40, def: 35, spa: 50, spd: 100, spe: 70},
        weightkg: 45.5
    },
    Tentacruel:
    {
        id: 73,
        uid: 159,
        name: "Tentacruel",
        abilities: ["clearbody", "liquidooze"],
        types: ["water", "poison"],
        baseStats: {hp: 80, atk: 70, def: 65, spa: 80, spd: 120, spe: 100},
        weightkg: 55
    },
    Geodude:
    {
        id: 74,
        uid: 160,
        name: "Geodude",
        abilities: ["rockhead", "sturdy"],
        types: ["rock", "ground"],
        baseStats: {hp: 40, atk: 80, def: 100, spa: 30, spd: 30, spe: 20},
        weightkg: 20
    },
    Graveler:
    {
        id: 75,
        uid: 161,
        name: "Graveler",
        abilities: ["rockhead", "sturdy"],
        types: ["rock", "ground"],
        baseStats: {hp: 55, atk: 95, def: 115, spa: 45, spd: 45, spe: 35},
        weightkg: 105
    },
    Ponyta:
    {
        id: 77,
        uid: 162,
        name: "Ponyta",
        abilities: ["runaway", "flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 50, atk: 85, def: 55, spa: 65, spd: 65, spe: 90},
        weightkg: 30
    },
    Rapidash:
    {
        id: 78,
        uid: 163,
        name: "Rapidash",
        abilities: ["runaway", "flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 65, atk: 100, def: 70, spa: 80, spd: 80, spe: 105},
        weightkg: 95
    },
    Slowpoke:
    {
        id: 79,
        uid: 164,
        name: "Slowpoke",
        abilities: ["oblivious", "owntempo"],
        types: ["water", "psychic"],
        baseStats: {hp: 90, atk: 65, def: 65, spa: 40, spd: 40, spe: 15},
        weightkg: 36
    },
    Slowbro:
    {
        id: 80,
        uid: 165,
        name: "Slowbro",
        abilities: ["oblivious", "owntempo"],
        types: ["water", "psychic"],
        baseStats: {hp: 95, atk: 75, def: 110, spa: 100, spd: 80, spe: 30},
        weightkg: 78.5
    },
    Magnemite:
    {
        id: 81,
        uid: 166,
        name: "Magnemite",
        abilities: ["magnetpull", "sturdy"],
        types: ["electric", "steel"],
        baseStats: {hp: 25, atk: 35, def: 70, spa: 95, spd: 55, spe: 45},
        weightkg: 6
    },
    Magneton:
    {
        id: 82,
        uid: 167,
        name: "Magneton",
        abilities: ["magnetpull", "sturdy"],
        types: ["electric", "steel"],
        baseStats: {hp: 50, atk: 60, def: 95, spa: 120, spd: 70, spe: 70},
        weightkg: 60
    },
    Doduo:
    {
        id: 84,
        uid: 168,
        name: "Doduo",
        abilities: ["runaway", "earlybird"],
        types: ["normal", "flying"],
        baseStats: {hp: 35, atk: 85, def: 45, spa: 35, spd: 35, spe: 75},
        weightkg: 39.2
    },
    Seel:
    {
        id: 86,
        uid: 169,
        name: "Seel",
        abilities: ["thickfat", "hydration"],
        types: ["water", "???"],
        baseStats: {hp: 65, atk: 45, def: 55, spa: 45, spd: 70, spe: 45},
        weightkg: 90
    },
    Dewgong:
    {
        id: 87,
        uid: 170,
        name: "Dewgong",
        abilities: ["thickfat", "hydration"],
        types: ["water", "ice"],
        baseStats: {hp: 90, atk: 70, def: 80, spa: 70, spd: 95, spe: 70},
        weightkg: 120
    },
    Grimer:
    {
        id: 88,
        uid: 171,
        name: "Grimer",
        abilities: ["stench", "stickyhold"],
        types: ["poison", "???"],
        baseStats: {hp: 80, atk: 80, def: 50, spa: 40, spd: 50, spe: 25},
        weightkg: 30
    },
    Muk:
    {
        id: 89,
        uid: 172,
        name: "Muk",
        abilities: ["stench", "stickyhold"],
        types: ["poison", "???"],
        baseStats: {hp: 105, atk: 105, def: 75, spa: 65, spd: 100, spe: 50},
        weightkg: 30
    },
    Shellder:
    {
        id: 90,
        uid: 173,
        name: "Shellder",
        abilities: ["shellarmor", "skilllink"],
        types: ["water", "???"],
        baseStats: {hp: 30, atk: 65, def: 100, spa: 45, spd: 25, spe: 40},
        weightkg: 4
    },
    Cloyster:
    {
        id: 91,
        uid: 174,
        name: "Cloyster",
        abilities: ["shellarmor", "skilllink"],
        types: ["water", "ice"],
        baseStats: {hp: 50, atk: 95, def: 180, spa: 85, spd: 45, spe: 70},
        weightkg: 132.5
    },
    Gastly:
    {
        id: 92,
        uid: 175,
        name: "Gastly",
        abilities: ["levitate"],
        types: ["ghost", "poison"],
        baseStats: {hp: 30, atk: 35, def: 30, spa: 100, spd: 35, spe: 80},
        weightkg: 0.1
    },
    Haunter:
    {
        id: 93,
        uid: 176,
        name: "Haunter",
        abilities: ["levitate"],
        types: ["ghost", "poison"],
        baseStats: {hp: 45, atk: 50, def: 45, spa: 115, spd: 55, spe: 95},
        weightkg: 0.1
    },
    Onix:
    {
        id: 95,
        uid: 177,
        name: "Onix",
        abilities: ["rockhead", "sturdy"],
        types: ["rock", "ground"],
        baseStats: {hp: 35, atk: 45, def: 160, spa: 30, spd: 45, spe: 70},
        weightkg: 210
    },
    Drowzee:
    {
        id: 96,
        uid: 178,
        name: "Drowzee",
        abilities: ["insomnia", "forewarn"],
        types: ["psychic", "???"],
        baseStats: {hp: 60, atk: 48, def: 45, spa: 43, spd: 90, spe: 42},
        weightkg: 32.4
    },
    Hypno:
    {
        id: 97,
        uid: 179,
        name: "Hypno",
        abilities: ["insomnia", "forewarn"],
        types: ["psychic", "???"],
        baseStats: {hp: 85, atk: 73, def: 70, spa: 73, spd: 115, spe: 67},
        weightkg: 75.6
    },
    Krabby:
    {
        id: 98,
        uid: 180,
        name: "Krabby",
        abilities: ["hypercutter", "shellarmor"],
        types: ["water", "???"],
        baseStats: {hp: 30, atk: 105, def: 90, spa: 25, spd: 25, spe: 50},
        weightkg: 6.5
    },
    Kingler:
    {
        id: 99,
        uid: 181,
        name: "Kingler",
        abilities: ["hypercutter", "shellarmor"],
        types: ["water", "???"],
        baseStats: {hp: 55, atk: 130, def: 115, spa: 50, spd: 50, spe: 75},
        weightkg: 60
    },
    Voltorb:
    {
        id: 100,
        uid: 182,
        name: "Voltorb",
        abilities: ["soundproof", "static"],
        types: ["electric", "???"],
        baseStats: {hp: 40, atk: 30, def: 50, spa: 55, spd: 55, spe: 100},
        weightkg: 10.4
    },
    Exeggcute:
    {
        id: 102,
        uid: 183,
        name: "Exeggcute",
        abilities: ["chlorophyll"],
        types: ["grass", "psychic"],
        baseStats: {hp: 60, atk: 40, def: 80, spa: 60, spd: 45, spe: 40},
        weightkg: 2.5
    },
    Cubone:
    {
        id: 104,
        uid: 184,
        name: "Cubone",
        abilities: ["rockhead", "lightningrod"],
        types: ["ground", "???"],
        baseStats: {hp: 50, atk: 50, def: 95, spa: 40, spd: 50, spe: 35},
        weightkg: 6.5
    },
    Marowak:
    {
        id: 105,
        uid: 185,
        name: "Marowak",
        abilities: ["rockhead", "lightningrod"],
        types: ["ground", "???"],
        baseStats: {hp: 60, atk: 80, def: 110, spa: 50, spd: 80, spe: 45},
        weightkg: 45
    },
    Hitmonlee:
    {
        id: 106,
        uid: 186,
        name: "Hitmonlee",
        abilities: ["limber", "reckless"],
        types: ["fighting", "???"],
        baseStats: {hp: 50, atk: 120, def: 53, spa: 35, spd: 110, spe: 87},
        weightkg: 49.8
    },
    Hitmonchan:
    {
        id: 107,
        uid: 187,
        name: "Hitmonchan",
        abilities: ["keeneye", "ironfist"],
        types: ["fighting", "???"],
        baseStats: {hp: 50, atk: 105, def: 79, spa: 35, spd: 110, spe: 76},
        weightkg: 50.2
    },
    Lickitung:
    {
        id: 108,
        uid: 188,
        name: "Lickitung",
        abilities: ["owntempo", "oblivious"],
        types: ["normal", "???"],
        baseStats: {hp: 90, atk: 55, def: 75, spa: 60, spd: 75, spe: 30},
        weightkg: 65.5
    },
    Koffing:
    {
        id: 109,
        uid: 189,
        name: "Koffing",
        abilities: ["levitate"],
        types: ["poison", "???"],
        baseStats: {hp: 40, atk: 65, def: 95, spa: 60, spd: 45, spe: 35},
        weightkg: 1
    },
    Weezing:
    {
        id: 110,
        uid: 190,
        name: "Weezing",
        abilities: ["levitate"],
        types: ["poison", "???"],
        baseStats: {hp: 65, atk: 90, def: 120, spa: 85, spd: 70, spe: 60},
        weightkg: 9.5
    },
    Rhyhorn:
    {
        id: 111,
        uid: 191,
        name: "Rhyhorn",
        abilities: ["lightningrod", "rockhead"],
        types: ["ground", "rock"],
        baseStats: {hp: 80, atk: 85, def: 95, spa: 30, spd: 30, spe: 25},
        weightkg: 115
    },
    Rhydon:
    {
        id: 112,
        uid: 192,
        name: "Rhydon",
        abilities: ["lightningrod", "rockhead"],
        types: ["ground", "rock"],
        baseStats: {hp: 105, atk: 130, def: 120, spa: 45, spd: 45, spe: 40},
        weightkg: 120
    },
    Chansey:
    {
        id: 113,
        uid: 193,
        name: "Chansey",
        abilities: ["naturalcure", "serenegrace"],
        types: ["normal", "???"],
        baseStats: {hp: 250, atk: 5, def: 5, spa: 35, spd: 105, spe: 50},
        weightkg: 34.6
    },
    Tangela:
    {
        id: 114,
        uid: 194,
        name: "Tangela",
        abilities: ["chlorophyll", "leafguard"],
        types: ["grass", "???"],
        baseStats: {hp: 65, atk: 55, def: 115, spa: 100, spd: 40, spe: 60},
        weightkg: 35
    },
    Kangaskhan:
    {
        id: 115,
        uid: 195,
        name: "Kangaskhan",
        abilities: ["earlybird", "scrappy"],
        types: ["normal", "???"],
        baseStats: {hp: 105, atk: 95, def: 80, spa: 40, spd: 80, spe: 90},
        weightkg: 80
    },
    Horsea:
    {
        id: 116,
        uid: 196,
        name: "Horsea",
        abilities: ["swiftswim", "sniper"],
        types: ["water", "???"],
        baseStats: {hp: 30, atk: 40, def: 70, spa: 70, spd: 25, spe: 60},
        weightkg: 8
    },
    Seadra:
    {
        id: 117,
        uid: 197,
        name: "Seadra",
        abilities: ["poisonpoint", "sniper"],
        types: ["water", "???"],
        baseStats: {hp: 55, atk: 65, def: 95, spa: 95, spd: 45, spe: 85},
        weightkg: 25
    },
    Goldeen:
    {
        id: 118,
        uid: 198,
        name: "Goldeen",
        abilities: ["swiftswim", "waterveil"],
        types: ["water", "???"],
        baseStats: {hp: 45, atk: 67, def: 60, spa: 35, spd: 50, spe: 63},
        weightkg: 15
    },
    Seaking:
    {
        id: 119,
        uid: 199,
        name: "Seaking",
        abilities: ["swiftswim", "waterveil"],
        types: ["water", "???"],
        baseStats: {hp: 80, atk: 92, def: 65, spa: 65, spd: 80, spe: 68},
        weightkg: 39
    },
    Staryu:
    {
        id: 120,
        uid: 200,
        name: "Staryu",
        abilities: ["illuminate", "naturalcure"],
        types: ["water", "???"],
        baseStats: {hp: 30, atk: 45, def: 55, spa: 70, spd: 55, spe: 85},
        weightkg: 34.5
    },
    Starmie:
    {
        id: 121,
        uid: 201,
        name: "Starmie",
        abilities: ["illuminate", "naturalcure"],
        types: ["water", "psychic"],
        baseStats: {hp: 60, atk: 75, def: 85, spa: 100, spd: 85, spe: 115},
        weightkg: 80
    },
    Scyther:
    {
        id: 123,
        uid: 202,
        name: "Scyther",
        abilities: ["swarm", "technician"],
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 110, def: 80, spa: 55, spd: 80, spe: 105},
        weightkg: 56
    },
    Jynx:
    {
        id: 124,
        uid: 203,
        name: "Jynx",
        abilities: ["oblivious", "forewarn"],
        types: ["ice", "psychic"],
        baseStats: {hp: 65, atk: 50, def: 35, spa: 115, spd: 95, spe: 95},
        weightkg: 40.6
    },
    Electabuzz:
    {
        id: 125,
        uid: 204,
        name: "Electabuzz",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 65, atk: 83, def: 57, spa: 95, spd: 85, spe: 105},
        weightkg: 30
    },
    Magmar:
    {
        id: 126,
        uid: 205,
        name: "Magmar",
        abilities: ["flamebody"],
        types: ["fire", "???"],
        baseStats: {hp: 65, atk: 95, def: 57, spa: 100, spd: 85, spe: 93},
        weightkg: 44.5
    },
    Pinsir:
    {
        id: 127,
        uid: 206,
        name: "Pinsir",
        abilities: ["hypercutter", "moldbreaker"],
        types: ["bug", "???"],
        baseStats: {hp: 65, atk: 125, def: 100, spa: 55, spd: 70, spe: 85},
        weightkg: 55
    },
    Tauros:
    {
        id: 128,
        uid: 207,
        name: "Tauros",
        abilities: ["intimidate", "angerpoint"],
        types: ["normal", "???"],
        baseStats: {hp: 75, atk: 100, def: 95, spa: 40, spd: 70, spe: 110},
        weightkg: 88.4
    },
    Magikarp:
    {
        id: 129,
        uid: 208,
        name: "Magikarp",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 20, atk: 10, def: 55, spa: 15, spd: 20, spe: 80},
        weightkg: 10
    },
    Gyarados:
    {
        id: 130,
        uid: 209,
        name: "Gyarados",
        abilities: ["intimidate"],
        types: ["water", "flying"],
        baseStats: {hp: 95, atk: 125, def: 79, spa: 60, spd: 100, spe: 81},
        weightkg: 235
    },
    Lapras:
    {
        id: 131,
        uid: 210,
        name: "Lapras",
        abilities: ["waterabsorb", "shellarmor"],
        types: ["water", "ice"],
        baseStats: {hp: 130, atk: 85, def: 80, spa: 85, spd: 95, spe: 60},
        weightkg: 220
    },
    Ditto:
    {
        id: 132,
        uid: 211,
        name: "Ditto",
        abilities: ["limber"],
        types: ["normal", "???"],
        baseStats: {hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48},
        weightkg: 4
    },
    Eevee:
    {
        id: 133,
        uid: 212,
        name: "Eevee",
        abilities: ["runaway", "adaptability"],
        types: ["normal", "???"],
        baseStats: {hp: 55, atk: 55, def: 50, spa: 45, spd: 65, spe: 55},
        weightkg: 6.5
    },
    Vaporeon:
    {
        id: 134,
        uid: 213,
        name: "Vaporeon",
        abilities: ["waterabsorb"],
        types: ["water", "???"],
        baseStats: {hp: 130, atk: 65, def: 60, spa: 110, spd: 95, spe: 65},
        weightkg: 29
    },
    Jolteon:
    {
        id: 135,
        uid: 214,
        name: "Jolteon",
        abilities: ["voltabsorb"],
        types: ["electric", "???"],
        baseStats: {hp: 65, atk: 65, def: 60, spa: 110, spd: 95, spe: 130},
        weightkg: 24.5
    },
    Flareon:
    {
        id: 136,
        uid: 215,
        name: "Flareon",
        abilities: ["flashfire"],
        types: ["fire", "???"],
        baseStats: {hp: 65, atk: 130, def: 60, spa: 95, spd: 110, spe: 65},
        weightkg: 25
    },
    Porygon:
    {
        id: 137,
        uid: 216,
        name: "Porygon",
        abilities: ["trace", "download"],
        types: ["normal", "???"],
        baseStats: {hp: 65, atk: 60, def: 70, spa: 85, spd: 75, spe: 40},
        weightkg: 36.5
    },
    Omanyte:
    {
        id: 138,
        uid: 217,
        name: "Omanyte",
        abilities: ["swiftswim", "shellarmor"],
        types: ["rock", "water"],
        baseStats: {hp: 35, atk: 40, def: 100, spa: 90, spd: 55, spe: 35},
        weightkg: 7.5
    },
    Omastar:
    {
        id: 139,
        uid: 218,
        name: "Omastar",
        abilities: ["swiftswim", "shellarmor"],
        types: ["rock", "water"],
        baseStats: {hp: 70, atk: 60, def: 125, spa: 115, spd: 70, spe: 55},
        weightkg: 35
    },
    Kabuto:
    {
        id: 140,
        uid: 219,
        name: "Kabuto",
        abilities: ["swiftswim", "battlearmor"],
        types: ["rock", "water"],
        baseStats: {hp: 30, atk: 80, def: 90, spa: 55, spd: 45, spe: 55},
        weightkg: 11.5
    },
    Kabutops:
    {
        id: 141,
        uid: 220,
        name: "Kabutops",
        abilities: ["swiftswim", "battlearmor"],
        types: ["rock", "water"],
        baseStats: {hp: 60, atk: 115, def: 105, spa: 65, spd: 70, spe: 80},
        weightkg: 40.5
    },
    Aerodactyl:
    {
        id: 142,
        uid: 221,
        name: "Aerodactyl",
        abilities: ["rockhead", "pressure"],
        types: ["rock", "flying"],
        baseStats: {hp: 80, atk: 105, def: 65, spa: 60, spd: 75, spe: 130},
        weightkg: 59
    },
    Snorlax:
    {
        id: 143,
        uid: 222,
        name: "Snorlax",
        abilities: ["immunity", "thickfat"],
        types: ["normal", "???"],
        baseStats: {hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30},
        weightkg: 460
    },
    Dratini:
    {
        id: 147,
        uid: 223,
        name: "Dratini",
        abilities: ["shedskin"],
        types: ["dragon", "???"],
        baseStats: {hp: 41, atk: 64, def: 45, spa: 50, spd: 50, spe: 50},
        weightkg: 3.3
    },
    Dragonair:
    {
        id: 148,
        uid: 224,
        name: "Dragonair",
        abilities: ["shedskin"],
        types: ["dragon", "???"],
        baseStats: {hp: 61, atk: 84, def: 65, spa: 70, spd: 70, spe: 70},
        weightkg: 16.5
    },
    Dragonite:
    {
        id: 149,
        uid: 225,
        name: "Dragonite",
        abilities: ["innerfocus"],
        types: ["dragon", "flying"],
        baseStats: {hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80},
        weightkg: 210
    },
    Mewtwo:
    {
        id: 150,
        uid: 226,
        name: "Mewtwo",
        abilities: ["pressure"],
        types: ["psychic", "???"],
        baseStats: {hp: 106, atk: 110, def: 90, spa: 154, spd: 90, spe: 130},
        weightkg: 122
    },
    Mew:
    {
        id: 151,
        uid: 227,
        name: "Mew",
        abilities: ["synchronize"],
        types: ["psychic", "???"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 4
    },
    Sentret:
    {
        id: 161,
        uid: 228,
        name: "Sentret",
        abilities: ["runaway", "keeneye"],
        types: ["normal", "???"],
        baseStats: {hp: 35, atk: 46, def: 34, spa: 35, spd: 45, spe: 20},
        weightkg: 6
    },
    Furret:
    {
        id: 162,
        uid: 229,
        name: "Furret",
        abilities: ["runaway", "keeneye"],
        types: ["normal", "???"],
        baseStats: {hp: 85, atk: 76, def: 64, spa: 45, spd: 55, spe: 90},
        weightkg: 32.5
    },
    Hoothoot:
    {
        id: 163,
        uid: 230,
        name: "Hoothoot",
        abilities: ["insomnia", "keeneye"],
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 30, def: 30, spa: 36, spd: 56, spe: 50},
        weightkg: 21.2
    },
    Ledyba:
    {
        id: 165,
        uid: 231,
        name: "Ledyba",
        abilities: ["swarm", "earlybird"],
        types: ["bug", "flying"],
        baseStats: {hp: 40, atk: 20, def: 30, spa: 40, spd: 80, spe: 55},
        weightkg: 10.8
    },
    Ledian:
    {
        id: 166,
        uid: 232,
        name: "Ledian",
        abilities: ["swarm", "earlybird"],
        types: ["bug", "flying"],
        baseStats: {hp: 55, atk: 35, def: 50, spa: 55, spd: 110, spe: 85},
        weightkg: 35.6
    },
    Spinarak:
    {
        id: 167,
        uid: 233,
        name: "Spinarak",
        abilities: ["swarm", "insomnia"],
        types: ["bug", "poison"],
        baseStats: {hp: 40, atk: 60, def: 40, spa: 40, spd: 40, spe: 30},
        weightkg: 8.5
    },
    Crobat:
    {
        id: 169,
        uid: 234,
        name: "Crobat",
        abilities: ["innerfocus"],
        types: ["poison", "flying"],
        baseStats: {hp: 85, atk: 90, def: 80, spa: 70, spd: 80, spe: 130},
        weightkg: 75
    },
    Chinchou:
    {
        id: 170,
        uid: 235,
        name: "Chinchou",
        abilities: ["voltabsorb", "illuminate"],
        types: ["water", "electric"],
        baseStats: {hp: 75, atk: 38, def: 38, spa: 56, spd: 56, spe: 67},
        weightkg: 12
    },
    Lanturn:
    {
        id: 171,
        uid: 236,
        name: "Lanturn",
        abilities: ["voltabsorb", "illuminate"],
        types: ["water", "electric"],
        baseStats: {hp: 125, atk: 58, def: 58, spa: 76, spd: 76, spe: 67},
        weightkg: 22.5
    },
    Pichu:
    {
        id: 172,
        uid: 237,
        name: "Pichu",
        otherForms: ["pichuspikyeared"],
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 20, atk: 40, def: 15, spa: 35, spd: 35, spe: 60},
        weightkg: 2
    },
    "Pichu-Spiky-eared":
    {
        id: 172,
        uid: 238,
        name: "Pichu-Spiky-eared",
        baseSpecies: "Pichu",
        form: "Spiky-eared",
        formLetter: "S",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 20, atk: 40, def: 15, spa: 35, spd: 35, spe: 60},
        weightkg: 2
    },
    Natu:
    {
        id: 177,
        uid: 239,
        name: "Natu",
        abilities: ["synchronize", "earlybird"],
        types: ["psychic", "flying"],
        baseStats: {hp: 40, atk: 50, def: 45, spa: 70, spd: 45, spe: 70},
        weightkg: 2
    },
    Xatu:
    {
        id: 178,
        uid: 240,
        name: "Xatu",
        abilities: ["synchronize", "earlybird"],
        types: ["psychic", "flying"],
        baseStats: {hp: 65, atk: 75, def: 70, spa: 95, spd: 70, spe: 95},
        weightkg: 15
    },
    Mareep:
    {
        id: 179,
        uid: 241,
        name: "Mareep",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 55, atk: 40, def: 40, spa: 65, spd: 45, spe: 35},
        weightkg: 7.8
    },
    Flaaffy:
    {
        id: 180,
        uid: 242,
        name: "Flaaffy",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 70, atk: 55, def: 55, spa: 80, spd: 60, spe: 45},
        weightkg: 13.3
    },
    Sudowoodo:
    {
        id: 185,
        uid: 243,
        name: "Sudowoodo",
        abilities: ["sturdy", "rockhead"],
        types: ["rock", "???"],
        baseStats: {hp: 70, atk: 100, def: 115, spa: 30, spd: 65, spe: 30},
        weightkg: 38
    },
    Politoed:
    {
        id: 186,
        uid: 244,
        name: "Politoed",
        abilities: ["waterabsorb", "damp"],
        types: ["water", "???"],
        baseStats: {hp: 90, atk: 75, def: 75, spa: 90, spd: 100, spe: 70},
        weightkg: 33.9
    },
    Hoppip:
    {
        id: 187,
        uid: 245,
        name: "Hoppip",
        abilities: ["chlorophyll", "leafguard"],
        types: ["grass", "flying"],
        baseStats: {hp: 35, atk: 35, def: 40, spa: 35, spd: 55, spe: 50},
        weightkg: 0.5
    },
    Skiploom:
    {
        id: 188,
        uid: 246,
        name: "Skiploom",
        abilities: ["chlorophyll", "leafguard"],
        types: ["grass", "flying"],
        baseStats: {hp: 55, atk: 45, def: 50, spa: 45, spd: 65, spe: 80},
        weightkg: 1
    },
    Aipom:
    {
        id: 190,
        uid: 247,
        name: "Aipom",
        abilities: ["runaway", "pickup"],
        types: ["normal", "???"],
        baseStats: {hp: 55, atk: 70, def: 55, spa: 40, spd: 55, spe: 85},
        weightkg: 11.5
    },
    Sunkern:
    {
        id: 191,
        uid: 248,
        name: "Sunkern",
        abilities: ["chlorophyll", "solarpower"],
        types: ["grass", "???"],
        baseStats: {hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30},
        weightkg: 1.8
    },
    Sunflora:
    {
        id: 192,
        uid: 249,
        name: "Sunflora",
        abilities: ["chlorophyll", "solarpower"],
        types: ["grass", "???"],
        baseStats: {hp: 75, atk: 75, def: 55, spa: 105, spd: 85, spe: 30},
        weightkg: 8.5
    },
    Yanma:
    {
        id: 193,
        uid: 250,
        name: "Yanma",
        abilities: ["speedboost", "compoundeyes"],
        types: ["bug", "flying"],
        baseStats: {hp: 65, atk: 65, def: 45, spa: 75, spd: 45, spe: 95},
        weightkg: 38
    },
    Wooper:
    {
        id: 194,
        uid: 251,
        name: "Wooper",
        abilities: ["damp", "waterabsorb"],
        types: ["water", "ground"],
        baseStats: {hp: 55, atk: 45, def: 45, spa: 25, spd: 25, spe: 15},
        weightkg: 8.5
    },
    Quagsire:
    {
        id: 195,
        uid: 252,
        name: "Quagsire",
        abilities: ["damp", "waterabsorb"],
        types: ["water", "ground"],
        baseStats: {hp: 95, atk: 85, def: 85, spa: 65, spd: 65, spe: 35},
        weightkg: 75
    },
    Espeon:
    {
        id: 196,
        uid: 253,
        name: "Espeon",
        abilities: ["synchronize"],
        types: ["psychic", "???"],
        baseStats: {hp: 65, atk: 65, def: 60, spa: 130, spd: 95, spe: 110},
        weightkg: 26.5
    },
    Umbreon:
    {
        id: 197,
        uid: 254,
        name: "Umbreon",
        abilities: ["synchronize"],
        types: ["dark", "???"],
        baseStats: {hp: 95, atk: 65, def: 110, spa: 60, spd: 130, spe: 65},
        weightkg: 27
    },
    Murkrow:
    {
        id: 198,
        uid: 255,
        name: "Murkrow",
        abilities: ["insomnia", "superluck"],
        types: ["dark", "flying"],
        baseStats: {hp: 60, atk: 85, def: 42, spa: 85, spd: 42, spe: 91},
        weightkg: 2.1
    },
    Slowking:
    {
        id: 199,
        uid: 256,
        name: "Slowking",
        abilities: ["oblivious", "owntempo"],
        types: ["water", "psychic"],
        baseStats: {hp: 95, atk: 75, def: 80, spa: 100, spd: 110, spe: 30},
        weightkg: 79.5
    },
    Misdreavus:
    {
        id: 200,
        uid: 257,
        name: "Misdreavus",
        abilities: ["levitate"],
        types: ["ghost", "???"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 85, spd: 85, spe: 85},
        weightkg: 1
    },
    Unown:
    {
        id: 201,
        uid: 258,
        name: "Unown",
        baseForm: "A",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 48, atk: 72, def: 48, spa: 72, spd: 48, spe: 48},
        weightkg: 5
    },
    Wobbuffet:
    {
        id: 202,
        uid: 259,
        name: "Wobbuffet",
        abilities: ["shadowtag"],
        types: ["psychic", "???"],
        baseStats: {hp: 190, atk: 33, def: 58, spa: 33, spd: 58, spe: 33},
        weightkg: 28.5
    },
    Girafarig:
    {
        id: 203,
        uid: 260,
        name: "Girafarig",
        abilities: ["innerfocus", "earlybird"],
        types: ["normal", "psychic"],
        baseStats: {hp: 70, atk: 80, def: 65, spa: 90, spd: 65, spe: 85},
        weightkg: 41.5
    },
    Pineco:
    {
        id: 204,
        uid: 261,
        name: "Pineco",
        abilities: ["sturdy"],
        types: ["bug", "???"],
        baseStats: {hp: 50, atk: 65, def: 90, spa: 35, spd: 35, spe: 15},
        weightkg: 7.2
    },
    Forretress:
    {
        id: 205,
        uid: 262,
        name: "Forretress",
        abilities: ["sturdy"],
        types: ["bug", "steel"],
        baseStats: {hp: 75, atk: 90, def: 140, spa: 60, spd: 60, spe: 40},
        weightkg: 125.8
    },
    Dunsparce:
    {
        id: 206,
        uid: 263,
        name: "Dunsparce",
        abilities: ["serenegrace", "runaway"],
        types: ["normal", "???"],
        baseStats: {hp: 100, atk: 70, def: 70, spa: 65, spd: 65, spe: 45},
        weightkg: 14
    },
    Gligar:
    {
        id: 207,
        uid: 264,
        name: "Gligar",
        abilities: ["hypercutter", "sandveil"],
        types: ["ground", "flying"],
        baseStats: {hp: 65, atk: 75, def: 105, spa: 35, spd: 65, spe: 85},
        weightkg: 64.8
    },
    Steelix:
    {
        id: 208,
        uid: 265,
        name: "Steelix",
        abilities: ["rockhead", "sturdy"],
        types: ["steel", "ground"],
        baseStats: {hp: 75, atk: 85, def: 200, spa: 55, spd: 65, spe: 30},
        weightkg: 400
    },
    Scizor:
    {
        id: 212,
        uid: 266,
        name: "Scizor",
        abilities: ["swarm", "technician"],
        types: ["bug", "steel"],
        baseStats: {hp: 70, atk: 130, def: 100, spa: 55, spd: 80, spe: 65},
        weightkg: 118
    },
    Shuckle:
    {
        id: 213,
        uid: 267,
        name: "Shuckle",
        abilities: ["sturdy", "gluttony"],
        types: ["bug", "rock"],
        baseStats: {hp: 20, atk: 10, def: 230, spa: 10, spd: 230, spe: 5},
        weightkg: 20.5
    },
    Heracross:
    {
        id: 214,
        uid: 268,
        name: "Heracross",
        abilities: ["swarm", "guts"],
        types: ["bug", "fighting"],
        baseStats: {hp: 80, atk: 125, def: 75, spa: 40, spd: 95, spe: 85},
        weightkg: 54
    },
    Sneasel:
    {
        id: 215,
        uid: 269,
        name: "Sneasel",
        abilities: ["innerfocus", "keeneye"],
        types: ["dark", "ice"],
        baseStats: {hp: 55, atk: 95, def: 55, spa: 35, spd: 75, spe: 115},
        weightkg: 28
    },
    Teddiursa:
    {
        id: 216,
        uid: 270,
        name: "Teddiursa",
        abilities: ["pickup", "quickfeet"],
        types: ["normal", "???"],
        baseStats: {hp: 60, atk: 80, def: 50, spa: 50, spd: 50, spe: 40},
        weightkg: 8.8
    },
    Ursaring:
    {
        id: 217,
        uid: 271,
        name: "Ursaring",
        abilities: ["guts", "quickfeet"],
        types: ["normal", "???"],
        baseStats: {hp: 90, atk: 130, def: 75, spa: 75, spd: 75, spe: 55},
        weightkg: 125.8
    },
    Slugma:
    {
        id: 218,
        uid: 272,
        name: "Slugma",
        abilities: ["magmaarmor", "flamebody"],
        types: ["fire", "???"],
        baseStats: {hp: 40, atk: 40, def: 40, spa: 70, spd: 40, spe: 20},
        weightkg: 35
    },
    Swinub:
    {
        id: 220,
        uid: 273,
        name: "Swinub",
        abilities: ["oblivious", "snowcloak"],
        types: ["ice", "ground"],
        baseStats: {hp: 50, atk: 50, def: 40, spa: 30, spd: 30, spe: 50},
        weightkg: 6.5
    },
    Piloswine:
    {
        id: 221,
        uid: 274,
        name: "Piloswine",
        abilities: ["oblivious", "snowcloak"],
        types: ["ice", "ground"],
        baseStats: {hp: 100, atk: 100, def: 80, spa: 60, spd: 60, spe: 50},
        weightkg: 55.8
    },
    Remoraid:
    {
        id: 223,
        uid: 275,
        name: "Remoraid",
        abilities: ["hustle", "sniper"],
        types: ["water", "???"],
        baseStats: {hp: 35, atk: 65, def: 35, spa: 65, spd: 35, spe: 65},
        weightkg: 12
    },
    Octillery:
    {
        id: 224,
        uid: 276,
        name: "Octillery",
        abilities: ["suctioncups", "sniper"],
        types: ["water", "???"],
        baseStats: {hp: 75, atk: 105, def: 75, spa: 105, spd: 75, spe: 45},
        weightkg: 28.5
    },
    Delibird:
    {
        id: 225,
        uid: 277,
        name: "Delibird",
        abilities: ["vitalspirit", "hustle"],
        types: ["ice", "flying"],
        baseStats: {hp: 45, atk: 55, def: 45, spa: 65, spd: 45, spe: 75},
        weightkg: 16
    },
    Skarmory:
    {
        id: 227,
        uid: 278,
        name: "Skarmory",
        abilities: ["keeneye", "sturdy"],
        types: ["steel", "flying"],
        baseStats: {hp: 65, atk: 80, def: 140, spa: 40, spd: 70, spe: 70},
        weightkg: 50.5
    },
    Houndour:
    {
        id: 228,
        uid: 279,
        name: "Houndour",
        abilities: ["earlybird", "flashfire"],
        types: ["dark", "fire"],
        baseStats: {hp: 45, atk: 60, def: 30, spa: 80, spd: 50, spe: 65},
        weightkg: 10.8
    },
    Houndoom:
    {
        id: 229,
        uid: 280,
        name: "Houndoom",
        abilities: ["earlybird", "flashfire"],
        types: ["dark", "fire"],
        baseStats: {hp: 75, atk: 90, def: 50, spa: 110, spd: 80, spe: 95},
        weightkg: 35
    },
    Kingdra:
    {
        id: 230,
        uid: 281,
        name: "Kingdra",
        abilities: ["swiftswim", "sniper"],
        types: ["water", "dragon"],
        baseStats: {hp: 75, atk: 95, def: 95, spa: 95, spd: 95, spe: 85},
        weightkg: 152
    },
    Phanpy:
    {
        id: 231,
        uid: 282,
        name: "Phanpy",
        abilities: ["pickup"],
        types: ["ground", "???"],
        baseStats: {hp: 90, atk: 60, def: 60, spa: 40, spd: 40, spe: 40},
        weightkg: 33.5
    },
    Donphan:
    {
        id: 232,
        uid: 283,
        name: "Donphan",
        abilities: ["sturdy"],
        types: ["ground", "???"],
        baseStats: {hp: 90, atk: 120, def: 120, spa: 60, spd: 60, spe: 50},
        weightkg: 120
    },
    Porygon2:
    {
        id: 233,
        uid: 284,
        name: "Porygon2",
        abilities: ["trace", "download"],
        types: ["normal", "???"],
        baseStats: {hp: 85, atk: 80, def: 90, spa: 105, spd: 95, spe: 60},
        weightkg: 32.5
    },
    Stantler:
    {
        id: 234,
        uid: 285,
        name: "Stantler",
        abilities: ["intimidate", "frisk"],
        types: ["normal", "???"],
        baseStats: {hp: 73, atk: 95, def: 62, spa: 85, spd: 65, spe: 85},
        weightkg: 71.2
    },
    Smeargle:
    {
        id: 235,
        uid: 286,
        name: "Smeargle",
        abilities: ["owntempo", "technician"],
        types: ["normal", "???"],
        baseStats: {hp: 55, atk: 20, def: 35, spa: 20, spd: 45, spe: 75},
        weightkg: 58
    },
    Tyrogue:
    {
        id: 236,
        uid: 287,
        name: "Tyrogue",
        abilities: ["guts", "steadfast"],
        types: ["fighting", "???"],
        baseStats: {hp: 35, atk: 35, def: 35, spa: 35, spd: 35, spe: 35},
        weightkg: 21
    },
    Hitmontop:
    {
        id: 237,
        uid: 288,
        name: "Hitmontop",
        abilities: ["intimidate", "technician"],
        types: ["fighting", "???"],
        baseStats: {hp: 50, atk: 95, def: 95, spa: 35, spd: 110, spe: 70},
        weightkg: 48
    },
    Smoochum:
    {
        id: 238,
        uid: 289,
        name: "Smoochum",
        abilities: ["oblivious", "forewarn"],
        types: ["ice", "psychic"],
        baseStats: {hp: 45, atk: 30, def: 15, spa: 85, spd: 65, spe: 65},
        weightkg: 6
    },
    Elekid:
    {
        id: 239,
        uid: 290,
        name: "Elekid",
        abilities: ["static"],
        types: ["electric", "???"],
        baseStats: {hp: 45, atk: 63, def: 37, spa: 65, spd: 55, spe: 95},
        weightkg: 23.5
    },
    Magby:
    {
        id: 240,
        uid: 291,
        name: "Magby",
        abilities: ["flamebody"],
        types: ["fire", "???"],
        baseStats: {hp: 45, atk: 75, def: 37, spa: 70, spd: 55, spe: 83},
        weightkg: 21.4
    },
    Miltank:
    {
        id: 241,
        uid: 292,
        name: "Miltank",
        abilities: ["thickfat", "scrappy"],
        types: ["normal", "???"],
        baseStats: {hp: 95, atk: 80, def: 105, spa: 40, spd: 70, spe: 100},
        weightkg: 75.5
    },
    Blissey:
    {
        id: 242,
        uid: 293,
        name: "Blissey",
        abilities: ["naturalcure", "serenegrace"],
        types: ["normal", "???"],
        baseStats: {hp: 255, atk: 10, def: 10, spa: 75, spd: 135, spe: 55},
        weightkg: 46.8
    },
    Larvitar:
    {
        id: 246,
        uid: 294,
        name: "Larvitar",
        abilities: ["guts"],
        types: ["rock", "ground"],
        baseStats: {hp: 50, atk: 64, def: 50, spa: 45, spd: 50, spe: 41},
        weightkg: 72
    },
    Pupitar:
    {
        id: 247,
        uid: 295,
        name: "Pupitar",
        abilities: ["shedskin"],
        types: ["rock", "ground"],
        baseStats: {hp: 70, atk: 84, def: 70, spa: 65, spd: 70, spe: 51},
        weightkg: 152
    },
    Tyranitar:
    {
        id: 248,
        uid: 296,
        name: "Tyranitar",
        abilities: ["sandstream"],
        types: ["rock", "dark"],
        baseStats: {hp: 100, atk: 134, def: 110, spa: 95, spd: 100, spe: 61},
        weightkg: 202
    },
    Lugia:
    {
        id: 249,
        uid: 297,
        name: "Lugia",
        abilities: ["pressure"],
        types: ["psychic", "flying"],
        baseStats: {hp: 106, atk: 90, def: 130, spa: 90, spd: 154, spe: 110},
        weightkg: 216
    },
    "Ho-Oh":
    {
        id: 250,
        uid: 298,
        name: "Ho-Oh",
        abilities: ["pressure"],
        types: ["fire", "flying"],
        baseStats: {hp: 106, atk: 130, def: 90, spa: 110, spd: 154, spe: 90},
        weightkg: 199
    },
    Celebi:
    {
        id: 251,
        uid: 299,
        name: "Celebi",
        abilities: ["naturalcure"],
        types: ["psychic", "grass"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 5
    },
    Treecko:
    {
        id: 252,
        uid: 300,
        name: "Treecko",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 65, spd: 55, spe: 70},
        weightkg: 5
    },
    Grovyle:
    {
        id: 253,
        uid: 301,
        name: "Grovyle",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 50, atk: 65, def: 45, spa: 85, spd: 65, spe: 95},
        weightkg: 21.6
    },
    Sceptile:
    {
        id: 254,
        uid: 302,
        name: "Sceptile",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 70, atk: 85, def: 65, spa: 105, spd: 85, spe: 120},
        weightkg: 52.2
    },
    Torchic:
    {
        id: 255,
        uid: 303,
        name: "Torchic",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 45, atk: 60, def: 40, spa: 70, spd: 50, spe: 45},
        weightkg: 2.5
    },
    Combusken:
    {
        id: 256,
        uid: 304,
        name: "Combusken",
        abilities: ["blaze"],
        types: ["fire", "fighting"],
        baseStats: {hp: 60, atk: 85, def: 60, spa: 85, spd: 60, spe: 55},
        weightkg: 19.5
    },
    Blaziken:
    {
        id: 257,
        uid: 305,
        name: "Blaziken",
        abilities: ["blaze"],
        types: ["fire", "fighting"],
        baseStats: {hp: 80, atk: 120, def: 70, spa: 110, spd: 70, spe: 80},
        weightkg: 52
    },
    Mudkip:
    {
        id: 258,
        uid: 306,
        name: "Mudkip",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 40},
        weightkg: 7.6
    },
    Marshtomp:
    {
        id: 259,
        uid: 307,
        name: "Marshtomp",
        abilities: ["torrent"],
        types: ["water", "ground"],
        baseStats: {hp: 70, atk: 85, def: 70, spa: 60, spd: 70, spe: 50},
        weightkg: 28
    },
    Swampert:
    {
        id: 260,
        uid: 308,
        name: "Swampert",
        abilities: ["torrent"],
        types: ["water", "ground"],
        baseStats: {hp: 100, atk: 110, def: 90, spa: 85, spd: 90, spe: 60},
        weightkg: 81.9
    },
    Poochyena:
    {
        id: 261,
        uid: 309,
        name: "Poochyena",
        abilities: ["runaway", "quickfeet"],
        types: ["dark", "???"],
        baseStats: {hp: 35, atk: 55, def: 35, spa: 30, spd: 30, spe: 35},
        weightkg: 13.6
    },
    Mightyena:
    {
        id: 262,
        uid: 310,
        name: "Mightyena",
        abilities: ["intimidate", "quickfeet"],
        types: ["dark", "???"],
        baseStats: {hp: 70, atk: 90, def: 70, spa: 60, spd: 60, spe: 70},
        weightkg: 37
    },
    Zigzagoon:
    {
        id: 263,
        uid: 311,
        name: "Zigzagoon",
        abilities: ["pickup", "gluttony"],
        types: ["normal", "???"],
        baseStats: {hp: 38, atk: 30, def: 41, spa: 30, spd: 41, spe: 60},
        weightkg: 17.5
    },
    Linoone:
    {
        id: 264,
        uid: 312,
        name: "Linoone",
        abilities: ["pickup", "gluttony"],
        types: ["normal", "???"],
        baseStats: {hp: 78, atk: 70, def: 61, spa: 50, spd: 61, spe: 100},
        weightkg: 32.5
    },
    Wurmple:
    {
        id: 265,
        uid: 313,
        name: "Wurmple",
        abilities: ["shielddust"],
        types: ["bug", "???"],
        baseStats: {hp: 45, atk: 45, def: 35, spa: 20, spd: 30, spe: 20},
        weightkg: 3.6
    },
    Silcoon:
    {
        id: 266,
        uid: 314,
        name: "Silcoon",
        abilities: ["shedskin"],
        types: ["bug", "???"],
        baseStats: {hp: 50, atk: 35, def: 55, spa: 25, spd: 25, spe: 15},
        weightkg: 10
    },
    Cascoon:
    {
        id: 268,
        uid: 315,
        name: "Cascoon",
        abilities: ["shedskin"],
        types: ["bug", "???"],
        baseStats: {hp: 50, atk: 35, def: 55, spa: 25, spd: 25, spe: 15},
        weightkg: 11.5
    },
    Dustox:
    {
        id: 269,
        uid: 316,
        name: "Dustox",
        abilities: ["shielddust"],
        types: ["bug", "poison"],
        baseStats: {hp: 60, atk: 50, def: 70, spa: 50, spd: 90, spe: 65},
        weightkg: 31.6
    },
    Lotad:
    {
        id: 270,
        uid: 317,
        name: "Lotad",
        abilities: ["swiftswim", "raindish"],
        types: ["water", "grass"],
        baseStats: {hp: 40, atk: 30, def: 30, spa: 40, spd: 50, spe: 30},
        weightkg: 2.6
    },
    Lombre:
    {
        id: 271,
        uid: 318,
        name: "Lombre",
        abilities: ["swiftswim", "raindish"],
        types: ["water", "grass"],
        baseStats: {hp: 60, atk: 50, def: 50, spa: 60, spd: 70, spe: 50},
        weightkg: 32.5
    },
    Ludicolo:
    {
        id: 272,
        uid: 319,
        name: "Ludicolo",
        abilities: ["swiftswim", "raindish"],
        types: ["water", "grass"],
        baseStats: {hp: 80, atk: 70, def: 70, spa: 90, spd: 100, spe: 70},
        weightkg: 55
    },
    Seedot:
    {
        id: 273,
        uid: 320,
        name: "Seedot",
        abilities: ["chlorophyll", "earlybird"],
        types: ["grass", "???"],
        baseStats: {hp: 40, atk: 40, def: 50, spa: 30, spd: 30, spe: 30},
        weightkg: 4
    },
    Nuzleaf:
    {
        id: 274,
        uid: 321,
        name: "Nuzleaf",
        abilities: ["chlorophyll", "earlybird"],
        types: ["grass", "dark"],
        baseStats: {hp: 70, atk: 70, def: 40, spa: 60, spd: 40, spe: 60},
        weightkg: 28
    },
    Shiftry:
    {
        id: 275,
        uid: 322,
        name: "Shiftry",
        abilities: ["chlorophyll", "earlybird"],
        types: ["grass", "dark"],
        baseStats: {hp: 90, atk: 100, def: 60, spa: 90, spd: 60, spe: 80},
        weightkg: 59.6
    },
    Taillow:
    {
        id: 276,
        uid: 323,
        name: "Taillow",
        abilities: ["guts"],
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 85},
        weightkg: 2.3
    },
    Surskit:
    {
        id: 283,
        uid: 324,
        name: "Surskit",
        abilities: ["swiftswim"],
        types: ["bug", "water"],
        baseStats: {hp: 40, atk: 30, def: 32, spa: 50, spd: 52, spe: 65},
        weightkg: 1.7
    },
    Shroomish:
    {
        id: 285,
        uid: 325,
        name: "Shroomish",
        abilities: ["effectspore", "poisonheal"],
        types: ["grass", "???"],
        baseStats: {hp: 60, atk: 40, def: 60, spa: 40, spd: 60, spe: 35},
        weightkg: 4.5
    },
    Breloom:
    {
        id: 286,
        uid: 326,
        name: "Breloom",
        abilities: ["effectspore", "poisonheal"],
        types: ["grass", "fighting"],
        baseStats: {hp: 60, atk: 130, def: 80, spa: 60, spd: 60, spe: 70},
        weightkg: 39.2
    },
    Slakoth:
    {
        id: 287,
        uid: 327,
        name: "Slakoth",
        abilities: ["truant"],
        types: ["normal", "???"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 35, spd: 35, spe: 30},
        weightkg: 24
    },
    Vigoroth:
    {
        id: 288,
        uid: 328,
        name: "Vigoroth",
        abilities: ["vitalspirit"],
        types: ["normal", "???"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 55, spd: 55, spe: 90},
        weightkg: 46.5
    },
    Slaking:
    {
        id: 289,
        uid: 329,
        name: "Slaking",
        abilities: ["truant"],
        types: ["normal", "???"],
        baseStats: {hp: 150, atk: 160, def: 100, spa: 95, spd: 65, spe: 100},
        weightkg: 130.5
    },
    Nincada:
    {
        id: 290,
        uid: 330,
        name: "Nincada",
        abilities: ["compoundeyes"],
        types: ["bug", "ground"],
        baseStats: {hp: 31, atk: 45, def: 90, spa: 30, spd: 30, spe: 40},
        weightkg: 5.5
    },
    Ninjask:
    {
        id: 291,
        uid: 331,
        name: "Ninjask",
        abilities: ["speedboost"],
        types: ["bug", "flying"],
        baseStats: {hp: 61, atk: 90, def: 45, spa: 50, spd: 50, spe: 160},
        weightkg: 12
    },
    Shedinja:
    {
        id: 292,
        uid: 332,
        name: "Shedinja",
        abilities: ["wonderguard"],
        types: ["bug", "ghost"],
        baseStats: {hp: 1, atk: 90, def: 45, spa: 30, spd: 30, spe: 40},
        weightkg: 1.2
    },
    Whismur:
    {
        id: 293,
        uid: 333,
        name: "Whismur",
        abilities: ["soundproof"],
        types: ["normal", "???"],
        baseStats: {hp: 64, atk: 51, def: 23, spa: 51, spd: 23, spe: 28},
        weightkg: 16.3
    },
    Loudred:
    {
        id: 294,
        uid: 334,
        name: "Loudred",
        abilities: ["soundproof"],
        types: ["normal", "???"],
        baseStats: {hp: 84, atk: 71, def: 43, spa: 71, spd: 43, spe: 48},
        weightkg: 40.5
    },
    Makuhita:
    {
        id: 296,
        uid: 335,
        name: "Makuhita",
        abilities: ["thickfat", "guts"],
        types: ["fighting", "???"],
        baseStats: {hp: 72, atk: 60, def: 30, spa: 20, spd: 30, spe: 25},
        weightkg: 86.4
    },
    Hariyama:
    {
        id: 297,
        uid: 336,
        name: "Hariyama",
        abilities: ["thickfat", "guts"],
        types: ["fighting", "???"],
        baseStats: {hp: 144, atk: 120, def: 60, spa: 40, spd: 60, spe: 50},
        weightkg: 253.8
    },
    Nosepass:
    {
        id: 299,
        uid: 337,
        name: "Nosepass",
        abilities: ["sturdy", "magnetpull"],
        types: ["rock", "???"],
        baseStats: {hp: 30, atk: 45, def: 135, spa: 45, spd: 90, spe: 30},
        weightkg: 97
    },
    Skitty:
    {
        id: 300,
        uid: 338,
        name: "Skitty",
        abilities: ["cutecharm", "normalize"],
        types: ["normal", "???"],
        baseStats: {hp: 50, atk: 45, def: 45, spa: 35, spd: 35, spe: 50},
        weightkg: 11
    },
    Sableye:
    {
        id: 302,
        uid: 339,
        name: "Sableye",
        abilities: ["keeneye", "stall"],
        types: ["dark", "ghost"],
        baseStats: {hp: 50, atk: 75, def: 75, spa: 65, spd: 65, spe: 50},
        weightkg: 11
    },
    Aron:
    {
        id: 304,
        uid: 340,
        name: "Aron",
        abilities: ["sturdy", "rockhead"],
        types: ["steel", "rock"],
        baseStats: {hp: 50, atk: 70, def: 100, spa: 40, spd: 40, spe: 30},
        weightkg: 60
    },
    Lairon:
    {
        id: 305,
        uid: 341,
        name: "Lairon",
        abilities: ["sturdy", "rockhead"],
        types: ["steel", "rock"],
        baseStats: {hp: 60, atk: 90, def: 140, spa: 50, spd: 50, spe: 40},
        weightkg: 120
    },
    Aggron:
    {
        id: 306,
        uid: 342,
        name: "Aggron",
        abilities: ["sturdy", "rockhead"],
        types: ["steel", "rock"],
        baseStats: {hp: 70, atk: 110, def: 180, spa: 60, spd: 60, spe: 50},
        weightkg: 360
    },
    Meditite:
    {
        id: 307,
        uid: 343,
        name: "Meditite",
        abilities: ["purepower"],
        types: ["fighting", "psychic"],
        baseStats: {hp: 30, atk: 40, def: 55, spa: 40, spd: 55, spe: 60},
        weightkg: 11.2
    },
    Medicham:
    {
        id: 308,
        uid: 344,
        name: "Medicham",
        abilities: ["purepower"],
        types: ["fighting", "psychic"],
        baseStats: {hp: 60, atk: 60, def: 75, spa: 60, spd: 75, spe: 80},
        weightkg: 31.5
    },
    Electrike:
    {
        id: 309,
        uid: 345,
        name: "Electrike",
        abilities: ["static", "lightningrod"],
        types: ["electric", "???"],
        baseStats: {hp: 40, atk: 45, def: 40, spa: 65, spd: 40, spe: 65},
        weightkg: 15.2
    },
    Manectric:
    {
        id: 310,
        uid: 346,
        name: "Manectric",
        abilities: ["static", "lightningrod"],
        types: ["electric", "???"],
        baseStats: {hp: 70, atk: 75, def: 60, spa: 105, spd: 60, spe: 105},
        weightkg: 40.2
    },
    Roselia:
    {
        id: 315,
        uid: 347,
        name: "Roselia",
        abilities: ["naturalcure", "poisonpoint"],
        types: ["grass", "poison"],
        baseStats: {hp: 50, atk: 60, def: 45, spa: 100, spd: 80, spe: 65},
        weightkg: 2
    },
    Gulpin:
    {
        id: 316,
        uid: 348,
        name: "Gulpin",
        abilities: ["liquidooze", "stickyhold"],
        types: ["poison", "???"],
        baseStats: {hp: 70, atk: 43, def: 53, spa: 43, spd: 53, spe: 40},
        weightkg: 10.3
    },
    Swalot:
    {
        id: 317,
        uid: 349,
        name: "Swalot",
        abilities: ["liquidooze", "stickyhold"],
        types: ["poison", "???"],
        baseStats: {hp: 100, atk: 73, def: 83, spa: 73, spd: 83, spe: 55},
        weightkg: 80
    },
    Carvanha:
    {
        id: 318,
        uid: 350,
        name: "Carvanha",
        abilities: ["roughskin"],
        types: ["water", "dark"],
        baseStats: {hp: 45, atk: 90, def: 20, spa: 65, spd: 20, spe: 65},
        weightkg: 20.8
    },
    Sharpedo:
    {
        id: 319,
        uid: 351,
        name: "Sharpedo",
        abilities: ["roughskin"],
        types: ["water", "dark"],
        baseStats: {hp: 70, atk: 120, def: 40, spa: 95, spd: 40, spe: 95},
        weightkg: 88.8
    },
    Wailmer:
    {
        id: 320,
        uid: 352,
        name: "Wailmer",
        abilities: ["waterveil", "oblivious"],
        types: ["water", "???"],
        baseStats: {hp: 130, atk: 70, def: 35, spa: 70, spd: 35, spe: 60},
        weightkg: 130
    },
    Wailord:
    {
        id: 321,
        uid: 353,
        name: "Wailord",
        abilities: ["waterveil", "oblivious"],
        types: ["water", "???"],
        baseStats: {hp: 170, atk: 90, def: 45, spa: 90, spd: 45, spe: 60},
        weightkg: 398
    },
    Numel:
    {
        id: 322,
        uid: 354,
        name: "Numel",
        abilities: ["oblivious", "simple"],
        types: ["fire", "ground"],
        baseStats: {hp: 60, atk: 60, def: 40, spa: 65, spd: 45, spe: 35},
        weightkg: 24
    },
    Camerupt:
    {
        id: 323,
        uid: 355,
        name: "Camerupt",
        abilities: ["magmaarmor", "solidrock"],
        types: ["fire", "ground"],
        baseStats: {hp: 70, atk: 100, def: 70, spa: 105, spd: 75, spe: 40},
        weightkg: 220
    },
    Spoink:
    {
        id: 325,
        uid: 356,
        name: "Spoink",
        abilities: ["thickfat", "owntempo"],
        types: ["psychic", "???"],
        baseStats: {hp: 60, atk: 25, def: 35, spa: 70, spd: 80, spe: 60},
        weightkg: 30.6
    },
    Grumpig:
    {
        id: 326,
        uid: 357,
        name: "Grumpig",
        abilities: ["thickfat", "owntempo"],
        types: ["psychic", "???"],
        baseStats: {hp: 80, atk: 45, def: 65, spa: 90, spd: 110, spe: 80},
        weightkg: 71.5
    },
    Spinda:
    {
        id: 327,
        uid: 358,
        name: "Spinda",
        abilities: ["owntempo", "tangledfeet"],
        types: ["normal", "???"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60},
        weightkg: 5
    },
    Trapinch:
    {
        id: 328,
        uid: 359,
        name: "Trapinch",
        abilities: ["hypercutter", "arenatrap"],
        types: ["ground", "???"],
        baseStats: {hp: 45, atk: 100, def: 45, spa: 45, spd: 45, spe: 10},
        weightkg: 15
    },
    Vibrava:
    {
        id: 329,
        uid: 360,
        name: "Vibrava",
        abilities: ["levitate"],
        types: ["ground", "dragon"],
        baseStats: {hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 70},
        weightkg: 15.3
    },
    Flygon:
    {
        id: 330,
        uid: 361,
        name: "Flygon",
        abilities: ["levitate"],
        types: ["ground", "dragon"],
        baseStats: {hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 100},
        weightkg: 82
    },
    Cacnea:
    {
        id: 331,
        uid: 362,
        name: "Cacnea",
        abilities: ["sandveil"],
        types: ["grass", "???"],
        baseStats: {hp: 50, atk: 85, def: 40, spa: 85, spd: 40, spe: 35},
        weightkg: 51.3
    },
    Cacturne:
    {
        id: 332,
        uid: 363,
        name: "Cacturne",
        abilities: ["sandveil"],
        types: ["grass", "dark"],
        baseStats: {hp: 70, atk: 115, def: 60, spa: 115, spd: 60, spe: 55},
        weightkg: 77.4
    },
    Swablu:
    {
        id: 333,
        uid: 364,
        name: "Swablu",
        abilities: ["naturalcure"],
        types: ["normal", "flying"],
        baseStats: {hp: 45, atk: 40, def: 60, spa: 40, spd: 75, spe: 50},
        weightkg: 1.2
    },
    Altaria:
    {
        id: 334,
        uid: 365,
        name: "Altaria",
        abilities: ["naturalcure"],
        types: ["dragon", "flying"],
        baseStats: {hp: 75, atk: 70, def: 90, spa: 70, spd: 105, spe: 80},
        weightkg: 20.6
    },
    Zangoose:
    {
        id: 335,
        uid: 366,
        name: "Zangoose",
        abilities: ["immunity"],
        types: ["normal", "???"],
        baseStats: {hp: 73, atk: 115, def: 60, spa: 60, spd: 60, spe: 90},
        weightkg: 40.3
    },
    Seviper:
    {
        id: 336,
        uid: 367,
        name: "Seviper",
        abilities: ["shedskin"],
        types: ["poison", "???"],
        baseStats: {hp: 73, atk: 100, def: 60, spa: 100, spd: 60, spe: 65},
        weightkg: 52.5
    },
    Barboach:
    {
        id: 339,
        uid: 368,
        name: "Barboach",
        abilities: ["oblivious", "anticipation"],
        types: ["water", "ground"],
        baseStats: {hp: 50, atk: 48, def: 43, spa: 46, spd: 41, spe: 60},
        weightkg: 1.9
    },
    Whiscash:
    {
        id: 340,
        uid: 369,
        name: "Whiscash",
        abilities: ["oblivious", "anticipation"],
        types: ["water", "ground"],
        baseStats: {hp: 110, atk: 78, def: 73, spa: 76, spd: 71, spe: 60},
        weightkg: 23.6
    },
    Corphish:
    {
        id: 341,
        uid: 370,
        name: "Corphish",
        abilities: ["hypercutter", "shellarmor"],
        types: ["water", "???"],
        baseStats: {hp: 43, atk: 80, def: 65, spa: 50, spd: 35, spe: 35},
        weightkg: 11.5
    },
    Crawdaunt:
    {
        id: 342,
        uid: 371,
        name: "Crawdaunt",
        abilities: ["hypercutter", "shellarmor"],
        types: ["water", "dark"],
        baseStats: {hp: 63, atk: 120, def: 85, spa: 90, spd: 55, spe: 55},
        weightkg: 32.8
    },
    Baltoy:
    {
        id: 343,
        uid: 372,
        name: "Baltoy",
        abilities: ["levitate"],
        types: ["ground", "psychic"],
        baseStats: {hp: 40, atk: 40, def: 55, spa: 40, spd: 70, spe: 55},
        weightkg: 21.5
    },
    Claydol:
    {
        id: 344,
        uid: 373,
        name: "Claydol",
        abilities: ["levitate"],
        types: ["ground", "psychic"],
        baseStats: {hp: 60, atk: 70, def: 105, spa: 70, spd: 120, spe: 75},
        weightkg: 108
    },
    Lileep:
    {
        id: 345,
        uid: 374,
        name: "Lileep",
        abilities: ["suctioncups"],
        types: ["rock", "grass"],
        baseStats: {hp: 66, atk: 41, def: 77, spa: 61, spd: 87, spe: 23},
        weightkg: 23.8
    },
    Cradily:
    {
        id: 346,
        uid: 375,
        name: "Cradily",
        abilities: ["suctioncups"],
        types: ["rock", "grass"],
        baseStats: {hp: 86, atk: 81, def: 97, spa: 81, spd: 107, spe: 43},
        weightkg: 60.4
    },
    Anorith:
    {
        id: 347,
        uid: 376,
        name: "Anorith",
        abilities: ["battlearmor"],
        types: ["rock", "bug"],
        baseStats: {hp: 45, atk: 95, def: 50, spa: 40, spd: 50, spe: 75},
        weightkg: 12.5
    },
    Armaldo:
    {
        id: 348,
        uid: 377,
        name: "Armaldo",
        abilities: ["battlearmor"],
        types: ["rock", "bug"],
        baseStats: {hp: 75, atk: 125, def: 100, spa: 70, spd: 80, spe: 45},
        weightkg: 68.2
    },
    Feebas:
    {
        id: 349,
        uid: 378,
        name: "Feebas",
        abilities: ["swiftswim", "oblivious"],
        types: ["water", "???"],
        baseStats: {hp: 20, atk: 15, def: 20, spa: 10, spd: 55, spe: 80},
        weightkg: 7.4
    },
    "Castform-Snowy":
    {
        id: 351,
        uid: 379,
        name: "Castform-Snowy",
        baseSpecies: "Castform",
        form: "Snowy",
        formLetter: "S",
        abilities: ["forecast"],
        types: ["ice", "???"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    Shuppet:
    {
        id: 353,
        uid: 380,
        name: "Shuppet",
        abilities: ["insomnia", "frisk"],
        types: ["ghost", "???"],
        baseStats: {hp: 44, atk: 75, def: 35, spa: 63, spd: 33, spe: 45},
        weightkg: 2.3
    },
    Banette:
    {
        id: 354,
        uid: 381,
        name: "Banette",
        abilities: ["insomnia", "frisk"],
        types: ["ghost", "???"],
        baseStats: {hp: 64, atk: 115, def: 65, spa: 83, spd: 63, spe: 65},
        weightkg: 12.5
    },
    Tropius:
    {
        id: 357,
        uid: 382,
        name: "Tropius",
        abilities: ["chlorophyll", "solarpower"],
        types: ["grass", "flying"],
        baseStats: {hp: 99, atk: 68, def: 83, spa: 72, spd: 87, spe: 51},
        weightkg: 100
    },
    Absol:
    {
        id: 359,
        uid: 383,
        name: "Absol",
        abilities: ["pressure", "superluck"],
        types: ["dark", "???"],
        baseStats: {hp: 65, atk: 130, def: 60, spa: 75, spd: 60, spe: 75},
        weightkg: 47
    },
    Wynaut:
    {
        id: 360,
        uid: 384,
        name: "Wynaut",
        abilities: ["shadowtag"],
        types: ["psychic", "???"],
        baseStats: {hp: 95, atk: 23, def: 48, spa: 23, spd: 48, spe: 23},
        weightkg: 14
    },
    Snorunt:
    {
        id: 361,
        uid: 385,
        name: "Snorunt",
        abilities: ["innerfocus", "icebody"],
        types: ["ice", "???"],
        baseStats: {hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50},
        weightkg: 16.8
    },
    Glalie:
    {
        id: 362,
        uid: 386,
        name: "Glalie",
        abilities: ["innerfocus", "icebody"],
        types: ["ice", "???"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
        weightkg: 256.5
    },
    Spheal:
    {
        id: 363,
        uid: 387,
        name: "Spheal",
        abilities: ["thickfat", "icebody"],
        types: ["ice", "water"],
        baseStats: {hp: 70, atk: 40, def: 50, spa: 55, spd: 50, spe: 25},
        weightkg: 39.5
    },
    Sealeo:
    {
        id: 364,
        uid: 388,
        name: "Sealeo",
        abilities: ["thickfat", "icebody"],
        types: ["ice", "water"],
        baseStats: {hp: 90, atk: 60, def: 70, spa: 75, spd: 70, spe: 45},
        weightkg: 87.6
    },
    Walrein:
    {
        id: 365,
        uid: 389,
        name: "Walrein",
        abilities: ["thickfat", "icebody"],
        types: ["ice", "water"],
        baseStats: {hp: 110, atk: 80, def: 90, spa: 95, spd: 90, spe: 65},
        weightkg: 150.6
    },
    Clamperl:
    {
        id: 366,
        uid: 390,
        name: "Clamperl",
        abilities: ["shellarmor"],
        types: ["water", "???"],
        baseStats: {hp: 35, atk: 64, def: 85, spa: 74, spd: 55, spe: 32},
        weightkg: 52.5
    },
    Huntail:
    {
        id: 367,
        uid: 391,
        name: "Huntail",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 55, atk: 104, def: 105, spa: 94, spd: 75, spe: 52},
        weightkg: 27
    },
    Gorebyss:
    {
        id: 368,
        uid: 392,
        name: "Gorebyss",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 55, atk: 84, def: 105, spa: 114, spd: 75, spe: 52},
        weightkg: 22.6
    },
    Relicanth:
    {
        id: 369,
        uid: 393,
        name: "Relicanth",
        abilities: ["swiftswim", "rockhead"],
        types: ["water", "rock"],
        baseStats: {hp: 100, atk: 90, def: 130, spa: 45, spd: 65, spe: 55},
        weightkg: 23.4
    },
    Luvdisc:
    {
        id: 370,
        uid: 394,
        name: "Luvdisc",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 43, atk: 30, def: 55, spa: 40, spd: 65, spe: 97},
        weightkg: 8.7
    },
    Bagon:
    {
        id: 371,
        uid: 395,
        name: "Bagon",
        abilities: ["rockhead"],
        types: ["dragon", "???"],
        baseStats: {hp: 45, atk: 75, def: 60, spa: 40, spd: 30, spe: 50},
        weightkg: 42.1
    },
    Shelgon:
    {
        id: 372,
        uid: 396,
        name: "Shelgon",
        abilities: ["rockhead"],
        types: ["dragon", "???"],
        baseStats: {hp: 65, atk: 95, def: 100, spa: 60, spd: 50, spe: 50},
        weightkg: 110.5
    },
    Salamence:
    {
        id: 373,
        uid: 397,
        name: "Salamence",
        abilities: ["intimidate"],
        types: ["dragon", "flying"],
        baseStats: {hp: 95, atk: 135, def: 80, spa: 110, spd: 80, spe: 100},
        weightkg: 102.6
    },
    Beldum:
    {
        id: 374,
        uid: 398,
        name: "Beldum",
        abilities: ["clearbody"],
        types: ["steel", "psychic"],
        baseStats: {hp: 40, atk: 55, def: 80, spa: 35, spd: 60, spe: 30},
        weightkg: 95.2
    },
    Metang:
    {
        id: 375,
        uid: 399,
        name: "Metang",
        abilities: ["clearbody"],
        types: ["steel", "psychic"],
        baseStats: {hp: 60, atk: 75, def: 100, spa: 55, spd: 80, spe: 50},
        weightkg: 202.5
    },
    Metagross:
    {
        id: 376,
        uid: 400,
        name: "Metagross",
        abilities: ["clearbody"],
        types: ["steel", "psychic"],
        baseStats: {hp: 80, atk: 135, def: 130, spa: 95, spd: 90, spe: 70},
        weightkg: 550
    },
    Latias:
    {
        id: 380,
        uid: 401,
        name: "Latias",
        abilities: ["levitate"],
        types: ["dragon", "psychic"],
        baseStats: {hp: 80, atk: 80, def: 90, spa: 110, spd: 130, spe: 110},
        weightkg: 40
    },
    Latios:
    {
        id: 381,
        uid: 402,
        name: "Latios",
        abilities: ["levitate"],
        types: ["dragon", "psychic"],
        baseStats: {hp: 80, atk: 90, def: 80, spa: 130, spd: 110, spe: 110},
        weightkg: 60
    },
    Kyogre:
    {
        id: 382,
        uid: 403,
        name: "Kyogre",
        abilities: ["drizzle"],
        types: ["water", "???"],
        baseStats: {hp: 100, atk: 100, def: 90, spa: 150, spd: 140, spe: 90},
        weightkg: 352
    },
    Groudon:
    {
        id: 383,
        uid: 404,
        name: "Groudon",
        abilities: ["drought"],
        types: ["ground", "???"],
        baseStats: {hp: 100, atk: 150, def: 140, spa: 100, spd: 90, spe: 90},
        weightkg: 950
    },
    Rayquaza:
    {
        id: 384,
        uid: 405,
        name: "Rayquaza",
        abilities: ["airlock"],
        types: ["dragon", "flying"],
        baseStats: {hp: 105, atk: 150, def: 90, spa: 150, spd: 90, spe: 95},
        weightkg: 206.5
    },
    Jirachi:
    {
        id: 385,
        uid: 406,
        name: "Jirachi",
        abilities: ["serenegrace"],
        types: ["steel", "psychic"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 1.1
    },
    Deoxys:
    {
        id: 386,
        uid: 407,
        name: "Deoxys",
        baseForm: "Normal",
        otherForms: ["deoxysattack", "deoxysdefense", "deoxysspeed"],
        abilities: ["pressure"],
        types: ["psychic", "???"],
        baseStats: {hp: 50, atk: 150, def: 50, spa: 150, spd: 50, spe: 150},
        weightkg: 60.8
    },
    "Deoxys-Attack":
    {
        id: 386,
        uid: 408,
        name: "Deoxys-Attack",
        baseSpecies: "Deoxys",
        form: "Attack",
        formLetter: "A",
        abilities: ["pressure"],
        types: ["psychic", "???"],
        baseStats: {hp: 50, atk: 180, def: 20, spa: 180, spd: 20, spe: 150},
        weightkg: 60.8
    },
    "Deoxys-Defense":
    {
        id: 386,
        uid: 409,
        name: "Deoxys-Defense",
        baseSpecies: "Deoxys",
        form: "Defense",
        formLetter: "D",
        abilities: ["pressure"],
        types: ["psychic", "???"],
        baseStats: {hp: 50, atk: 70, def: 160, spa: 70, spd: 160, spe: 90},
        weightkg: 60.8
    },
    "Deoxys-Speed":
    {
        id: 386,
        uid: 410,
        name: "Deoxys-Speed",
        baseSpecies: "Deoxys",
        form: "Speed",
        formLetter: "S",
        abilities: ["pressure"],
        types: ["psychic", "???"],
        baseStats: {hp: 50, atk: 95, def: 90, spa: 95, spd: 90, spe: 180},
        weightkg: 60.8
    },
    Turtwig:
    {
        id: 387,
        uid: 411,
        name: "Turtwig",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31},
        weightkg: 10.2
    },
    Grotle:
    {
        id: 388,
        uid: 412,
        name: "Grotle",
        abilities: ["overgrow"],
        types: ["grass", "???"],
        baseStats: {hp: 75, atk: 89, def: 85, spa: 55, spd: 65, spe: 36},
        weightkg: 97
    },
    Torterra:
    {
        id: 389,
        uid: 413,
        name: "Torterra",
        abilities: ["overgrow"],
        types: ["grass", "ground"],
        baseStats: {hp: 95, atk: 109, def: 105, spa: 75, spd: 85, spe: 56},
        weightkg: 310
    },
    Chimchar:
    {
        id: 390,
        uid: 414,
        name: "Chimchar",
        abilities: ["blaze"],
        types: ["fire", "???"],
        baseStats: {hp: 44, atk: 58, def: 44, spa: 58, spd: 44, spe: 61},
        weightkg: 6.2
    },
    Monferno:
    {
        id: 391,
        uid: 415,
        name: "Monferno",
        abilities: ["blaze"],
        types: ["fire", "fighting"],
        baseStats: {hp: 64, atk: 78, def: 52, spa: 78, spd: 52, spe: 81},
        weightkg: 22
    },
    Infernape:
    {
        id: 392,
        uid: 416,
        name: "Infernape",
        abilities: ["blaze"],
        types: ["fire", "fighting"],
        baseStats: {hp: 76, atk: 104, def: 71, spa: 104, spd: 71, spe: 108},
        weightkg: 55
    },
    Piplup:
    {
        id: 393,
        uid: 417,
        name: "Piplup",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 53, atk: 51, def: 53, spa: 61, spd: 56, spe: 40},
        weightkg: 5.2
    },
    Prinplup:
    {
        id: 394,
        uid: 418,
        name: "Prinplup",
        abilities: ["torrent"],
        types: ["water", "???"],
        baseStats: {hp: 64, atk: 66, def: 68, spa: 81, spd: 76, spe: 50},
        weightkg: 23
    },
    Empoleon:
    {
        id: 395,
        uid: 419,
        name: "Empoleon",
        abilities: ["torrent"],
        types: ["water", "steel"],
        baseStats: {hp: 84, atk: 86, def: 88, spa: 111, spd: 101, spe: 60},
        weightkg: 84.5
    },
    Staravia:
    {
        id: 397,
        uid: 420,
        name: "Staravia",
        abilities: ["intimidate"],
        types: ["normal", "flying"],
        baseStats: {hp: 55, atk: 75, def: 50, spa: 40, spd: 40, spe: 80},
        weightkg: 15.5
    },
    Bidoof:
    {
        id: 399,
        uid: 421,
        name: "Bidoof",
        abilities: ["simple", "unaware"],
        types: ["normal", "???"],
        baseStats: {hp: 59, atk: 45, def: 40, spa: 35, spd: 40, spe: 31},
        weightkg: 20
    },
    Bibarel:
    {
        id: 400,
        uid: 422,
        name: "Bibarel",
        abilities: ["simple", "unaware"],
        types: ["normal", "water"],
        baseStats: {hp: 79, atk: 85, def: 60, spa: 55, spd: 60, spe: 71},
        weightkg: 31.5
    },
    Kricketot:
    {
        id: 401,
        uid: 423,
        name: "Kricketot",
        abilities: ["shedskin"],
        types: ["bug", "???"],
        baseStats: {hp: 37, atk: 25, def: 41, spa: 25, spd: 41, spe: 25},
        weightkg: 2.2
    },
    Kricketune:
    {
        id: 402,
        uid: 424,
        name: "Kricketune",
        abilities: ["swarm"],
        types: ["bug", "???"],
        baseStats: {hp: 77, atk: 85, def: 51, spa: 55, spd: 51, spe: 65},
        weightkg: 25.5
    },
    Shinx:
    {
        id: 403,
        uid: 425,
        name: "Shinx",
        abilities: ["rivalry", "intimidate"],
        types: ["electric", "???"],
        baseStats: {hp: 45, atk: 65, def: 34, spa: 40, spd: 34, spe: 45},
        weightkg: 9.5
    },
    Luxio:
    {
        id: 404,
        uid: 426,
        name: "Luxio",
        abilities: ["rivalry", "intimidate"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 85, def: 49, spa: 60, spd: 49, spe: 60},
        weightkg: 30.5
    },
    Luxray:
    {
        id: 405,
        uid: 427,
        name: "Luxray",
        abilities: ["rivalry", "intimidate"],
        types: ["electric", "???"],
        baseStats: {hp: 80, atk: 120, def: 79, spa: 95, spd: 79, spe: 70},
        weightkg: 42
    },
    Budew:
    {
        id: 406,
        uid: 428,
        name: "Budew",
        abilities: ["naturalcure", "poisonpoint"],
        types: ["grass", "poison"],
        baseStats: {hp: 40, atk: 30, def: 35, spa: 50, spd: 70, spe: 55},
        weightkg: 1.2
    },
    Cranidos:
    {
        id: 408,
        uid: 429,
        name: "Cranidos",
        abilities: ["moldbreaker"],
        types: ["rock", "???"],
        baseStats: {hp: 67, atk: 125, def: 40, spa: 30, spd: 30, spe: 58},
        weightkg: 31.5
    },
    Rampardos:
    {
        id: 409,
        uid: 430,
        name: "Rampardos",
        abilities: ["moldbreaker"],
        types: ["rock", "???"],
        baseStats: {hp: 97, atk: 165, def: 60, spa: 65, spd: 50, spe: 58},
        weightkg: 102.5
    },
    Shieldon:
    {
        id: 410,
        uid: 431,
        name: "Shieldon",
        abilities: ["sturdy"],
        types: ["rock", "steel"],
        baseStats: {hp: 30, atk: 42, def: 118, spa: 42, spd: 88, spe: 30},
        weightkg: 57
    },
    Bastiodon:
    {
        id: 411,
        uid: 432,
        name: "Bastiodon",
        abilities: ["sturdy"],
        types: ["rock", "steel"],
        baseStats: {hp: 60, atk: 52, def: 168, spa: 47, spd: 138, spe: 30},
        weightkg: 149.5
    },
    Mothim:
    {
        id: 414,
        uid: 433,
        name: "Mothim",
        abilities: ["swarm"],
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 94, def: 50, spa: 94, spd: 50, spe: 66},
        weightkg: 23.3
    },
    Combee:
    {
        id: 415,
        uid: 434,
        name: "Combee",
        abilities: ["honeygather"],
        types: ["bug", "flying"],
        baseStats: {hp: 30, atk: 30, def: 42, spa: 30, spd: 42, spe: 70},
        weightkg: 5.5
    },
    Vespiquen:
    {
        id: 416,
        uid: 435,
        name: "Vespiquen",
        abilities: ["pressure"],
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 80, def: 102, spa: 80, spd: 102, spe: 40},
        weightkg: 38.5
    },
    Pachirisu:
    {
        id: 417,
        uid: 436,
        name: "Pachirisu",
        abilities: ["runaway", "pickup"],
        types: ["electric", "???"],
        baseStats: {hp: 60, atk: 45, def: 70, spa: 45, spd: 90, spe: 95},
        weightkg: 3.9
    },
    Buizel:
    {
        id: 418,
        uid: 437,
        name: "Buizel",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 55, atk: 65, def: 35, spa: 60, spd: 30, spe: 85},
        weightkg: 29.5
    },
    Floatzel:
    {
        id: 419,
        uid: 438,
        name: "Floatzel",
        abilities: ["swiftswim"],
        types: ["water", "???"],
        baseStats: {hp: 85, atk: 105, def: 55, spa: 85, spd: 50, spe: 115},
        weightkg: 33.5
    },
    Cherubi:
    {
        id: 420,
        uid: 439,
        name: "Cherubi",
        abilities: ["chlorophyll"],
        types: ["grass", "???"],
        baseStats: {hp: 45, atk: 35, def: 45, spa: 62, spd: 53, spe: 35},
        weightkg: 3.3
    },
    "Cherrim-Sunshine":
    {
        id: 421,
        uid: 440,
        name: "Cherrim-Sunshine",
        baseSpecies: "Cherrim",
        form: "Sunshine",
        formLetter: "S",
        abilities: ["flowergift"],
        types: ["grass", "???"],
        baseStats: {hp: 70, atk: 60, def: 70, spa: 87, spd: 78, spe: 85},
        weightkg: 9.3
    },
    Shellos:
    {
        id: 422,
        uid: 441,
        name: "Shellos",
        baseForm: "West",
        abilities: ["stickyhold", "stormdrain"],
        types: ["water", "???"],
        baseStats: {hp: 76, atk: 48, def: 48, spa: 57, spd: 62, spe: 34},
        weightkg: 6.3
    },
    Gastrodon:
    {
        id: 423,
        uid: 442,
        name: "Gastrodon",
        baseForm: "West",
        abilities: ["stickyhold", "stormdrain"],
        types: ["water", "ground"],
        baseStats: {hp: 111, atk: 83, def: 68, spa: 92, spd: 82, spe: 39},
        weightkg: 29.9
    },
    Ambipom:
    {
        id: 424,
        uid: 443,
        name: "Ambipom",
        abilities: ["technician", "pickup"],
        types: ["normal", "???"],
        baseStats: {hp: 75, atk: 100, def: 66, spa: 60, spd: 66, spe: 115},
        weightkg: 20.3
    },
    Drifloon:
    {
        id: 425,
        uid: 444,
        name: "Drifloon",
        abilities: ["aftermath", "unburden"],
        types: ["ghost", "flying"],
        baseStats: {hp: 90, atk: 50, def: 34, spa: 60, spd: 44, spe: 70},
        weightkg: 1.2
    },
    Drifblim:
    {
        id: 426,
        uid: 445,
        name: "Drifblim",
        abilities: ["aftermath", "unburden"],
        types: ["ghost", "flying"],
        baseStats: {hp: 150, atk: 80, def: 44, spa: 90, spd: 54, spe: 80},
        weightkg: 15
    },
    Buneary:
    {
        id: 427,
        uid: 446,
        name: "Buneary",
        abilities: ["runaway", "klutz"],
        types: ["normal", "???"],
        baseStats: {hp: 55, atk: 66, def: 44, spa: 44, spd: 56, spe: 85},
        weightkg: 5.5
    },
    Lopunny:
    {
        id: 428,
        uid: 447,
        name: "Lopunny",
        abilities: ["cutecharm", "klutz"],
        types: ["normal", "???"],
        baseStats: {hp: 65, atk: 76, def: 84, spa: 54, spd: 96, spe: 105},
        weightkg: 33.3
    },
    Mismagius:
    {
        id: 429,
        uid: 448,
        name: "Mismagius",
        abilities: ["levitate"],
        types: ["ghost", "???"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 105, spd: 105, spe: 105},
        weightkg: 4.4
    },
    Honchkrow:
    {
        id: 430,
        uid: 449,
        name: "Honchkrow",
        abilities: ["insomnia", "superluck"],
        types: ["dark", "flying"],
        baseStats: {hp: 100, atk: 125, def: 52, spa: 105, spd: 52, spe: 71},
        weightkg: 27.3
    },
    Glameow:
    {
        id: 431,
        uid: 450,
        name: "Glameow",
        abilities: ["limber", "owntempo"],
        types: ["normal", "???"],
        baseStats: {hp: 49, atk: 55, def: 42, spa: 42, spd: 37, spe: 85},
        weightkg: 3.9
    },
    Purugly:
    {
        id: 432,
        uid: 451,
        name: "Purugly",
        abilities: ["thickfat", "owntempo"],
        types: ["normal", "???"],
        baseStats: {hp: 71, atk: 82, def: 64, spa: 64, spd: 59, spe: 112},
        weightkg: 43.8
    },
    Chingling:
    {
        id: 433,
        uid: 452,
        name: "Chingling",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 45, atk: 30, def: 50, spa: 65, spd: 50, spe: 45},
        weightkg: 0.6
    },
    Stunky:
    {
        id: 434,
        uid: 453,
        name: "Stunky",
        abilities: ["stench", "aftermath"],
        types: ["poison", "dark"],
        baseStats: {hp: 63, atk: 63, def: 47, spa: 41, spd: 41, spe: 74},
        weightkg: 19.2
    },
    Skuntank:
    {
        id: 435,
        uid: 454,
        name: "Skuntank",
        abilities: ["stench", "aftermath"],
        types: ["poison", "dark"],
        baseStats: {hp: 103, atk: 93, def: 67, spa: 71, spd: 61, spe: 84},
        weightkg: 38
    },
    Bronzor:
    {
        id: 436,
        uid: 455,
        name: "Bronzor",
        abilities: ["levitate", "heatproof"],
        types: ["steel", "psychic"],
        baseStats: {hp: 57, atk: 24, def: 86, spa: 24, spd: 86, spe: 23},
        weightkg: 60.5
    },
    Bronzong:
    {
        id: 437,
        uid: 456,
        name: "Bronzong",
        abilities: ["levitate", "heatproof"],
        types: ["steel", "psychic"],
        baseStats: {hp: 67, atk: 89, def: 116, spa: 79, spd: 116, spe: 33},
        weightkg: 187
    },
    Bonsly:
    {
        id: 438,
        uid: 457,
        name: "Bonsly",
        abilities: ["sturdy", "rockhead"],
        types: ["rock", "???"],
        baseStats: {hp: 50, atk: 80, def: 95, spa: 10, spd: 45, spe: 10},
        weightkg: 15
    },
    Happiny:
    {
        id: 440,
        uid: 458,
        name: "Happiny",
        abilities: ["naturalcure", "serenegrace"],
        types: ["normal", "???"],
        baseStats: {hp: 100, atk: 5, def: 5, spa: 15, spd: 65, spe: 30},
        weightkg: 24.4
    },
    Chatot:
    {
        id: 441,
        uid: 459,
        name: "Chatot",
        abilities: ["keeneye", "tangledfeet"],
        types: ["normal", "flying"],
        baseStats: {hp: 76, atk: 65, def: 45, spa: 92, spd: 42, spe: 91},
        weightkg: 1.9
    },
    Spiritomb:
    {
        id: 442,
        uid: 460,
        name: "Spiritomb",
        abilities: ["pressure"],
        types: ["ghost", "dark"],
        baseStats: {hp: 50, atk: 92, def: 108, spa: 92, spd: 108, spe: 35},
        weightkg: 108
    },
    Gible:
    {
        id: 443,
        uid: 461,
        name: "Gible",
        abilities: ["sandveil"],
        types: ["dragon", "ground"],
        baseStats: {hp: 58, atk: 70, def: 45, spa: 40, spd: 45, spe: 42},
        weightkg: 20.5
    },
    Gabite:
    {
        id: 444,
        uid: 462,
        name: "Gabite",
        abilities: ["sandveil"],
        types: ["dragon", "ground"],
        baseStats: {hp: 68, atk: 90, def: 65, spa: 50, spd: 55, spe: 82},
        weightkg: 56
    },
    Garchomp:
    {
        id: 445,
        uid: 463,
        name: "Garchomp",
        abilities: ["sandveil"],
        types: ["dragon", "ground"],
        baseStats: {hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102},
        weightkg: 95
    },
    Munchlax:
    {
        id: 446,
        uid: 464,
        name: "Munchlax",
        abilities: ["pickup", "thickfat"],
        types: ["normal", "???"],
        baseStats: {hp: 135, atk: 85, def: 40, spa: 40, spd: 85, spe: 5},
        weightkg: 105
    },
    Riolu:
    {
        id: 447,
        uid: 465,
        name: "Riolu",
        abilities: ["steadfast", "innerfocus"],
        types: ["fighting", "???"],
        baseStats: {hp: 40, atk: 70, def: 40, spa: 35, spd: 40, spe: 60},
        weightkg: 20.2
    },
    Lucario:
    {
        id: 448,
        uid: 466,
        name: "Lucario",
        abilities: ["steadfast", "innerfocus"],
        types: ["fighting", "steel"],
        baseStats: {hp: 70, atk: 110, def: 70, spa: 115, spd: 70, spe: 90},
        weightkg: 54
    },
    Hippopotas:
    {
        id: 449,
        uid: 467,
        name: "Hippopotas",
        abilities: ["sandstream"],
        types: ["ground", "???"],
        baseStats: {hp: 68, atk: 72, def: 78, spa: 38, spd: 42, spe: 32},
        weightkg: 49.5
    },
    Hippowdon:
    {
        id: 450,
        uid: 468,
        name: "Hippowdon",
        abilities: ["sandstream"],
        types: ["ground", "???"],
        baseStats: {hp: 108, atk: 112, def: 118, spa: 68, spd: 72, spe: 47},
        weightkg: 300
    },
    Skorupi:
    {
        id: 451,
        uid: 469,
        name: "Skorupi",
        abilities: ["battlearmor", "sniper"],
        types: ["poison", "bug"],
        baseStats: {hp: 40, atk: 50, def: 90, spa: 30, spd: 55, spe: 65},
        weightkg: 12
    },
    Drapion:
    {
        id: 452,
        uid: 470,
        name: "Drapion",
        abilities: ["battlearmor", "sniper"],
        types: ["poison", "dark"],
        baseStats: {hp: 70, atk: 90, def: 110, spa: 60, spd: 75, spe: 95},
        weightkg: 61.5
    },
    Croagunk:
    {
        id: 453,
        uid: 471,
        name: "Croagunk",
        abilities: ["anticipation", "dryskin"],
        types: ["poison", "fighting"],
        baseStats: {hp: 48, atk: 61, def: 40, spa: 61, spd: 40, spe: 50},
        weightkg: 23
    },
    Toxicroak:
    {
        id: 454,
        uid: 472,
        name: "Toxicroak",
        abilities: ["anticipation", "dryskin"],
        types: ["poison", "fighting"],
        baseStats: {hp: 83, atk: 106, def: 65, spa: 86, spd: 65, spe: 85},
        weightkg: 44.4
    },
    Carnivine:
    {
        id: 455,
        uid: 473,
        name: "Carnivine",
        abilities: ["levitate"],
        types: ["grass", "???"],
        baseStats: {hp: 74, atk: 100, def: 72, spa: 90, spd: 72, spe: 46},
        weightkg: 27
    },
    Finneon:
    {
        id: 456,
        uid: 474,
        name: "Finneon",
        abilities: ["swiftswim", "stormdrain"],
        types: ["water", "???"],
        baseStats: {hp: 49, atk: 49, def: 56, spa: 49, spd: 61, spe: 66},
        weightkg: 7
    },
    Lumineon:
    {
        id: 457,
        uid: 475,
        name: "Lumineon",
        abilities: ["swiftswim", "stormdrain"],
        types: ["water", "???"],
        baseStats: {hp: 69, atk: 69, def: 76, spa: 69, spd: 86, spe: 91},
        weightkg: 24
    },
    Mantyke:
    {
        id: 458,
        uid: 476,
        name: "Mantyke",
        abilities: ["swiftswim", "waterabsorb"],
        types: ["water", "flying"],
        baseStats: {hp: 45, atk: 20, def: 50, spa: 60, spd: 120, spe: 50},
        weightkg: 65
    },
    Snover:
    {
        id: 459,
        uid: 477,
        name: "Snover",
        abilities: ["snowwarning"],
        types: ["grass", "ice"],
        baseStats: {hp: 60, atk: 62, def: 50, spa: 62, spd: 60, spe: 40},
        weightkg: 50.5
    },
    Abomasnow:
    {
        id: 460,
        uid: 478,
        name: "Abomasnow",
        abilities: ["snowwarning"],
        types: ["grass", "ice"],
        baseStats: {hp: 90, atk: 92, def: 75, spa: 92, spd: 85, spe: 60},
        weightkg: 135.5
    },
    Weavile:
    {
        id: 461,
        uid: 479,
        name: "Weavile",
        abilities: ["pressure"],
        types: ["dark", "ice"],
        baseStats: {hp: 70, atk: 120, def: 65, spa: 45, spd: 85, spe: 125},
        weightkg: 34
    },
    Magnezone:
    {
        id: 462,
        uid: 480,
        name: "Magnezone",
        abilities: ["magnetpull", "sturdy"],
        types: ["electric", "steel"],
        baseStats: {hp: 70, atk: 70, def: 115, spa: 130, spd: 90, spe: 60},
        weightkg: 180
    },
    Lickilicky:
    {
        id: 463,
        uid: 481,
        name: "Lickilicky",
        abilities: ["owntempo", "oblivious"],
        types: ["normal", "???"],
        baseStats: {hp: 110, atk: 85, def: 95, spa: 80, spd: 95, spe: 50},
        weightkg: 140
    },
    Rhyperior:
    {
        id: 464,
        uid: 482,
        name: "Rhyperior",
        abilities: ["lightningrod", "solidrock"],
        types: ["ground", "rock"],
        baseStats: {hp: 115, atk: 140, def: 130, spa: 55, spd: 55, spe: 40},
        weightkg: 282.8
    },
    Tangrowth:
    {
        id: 465,
        uid: 483,
        name: "Tangrowth",
        abilities: ["chlorophyll", "leafguard"],
        types: ["grass", "???"],
        baseStats: {hp: 100, atk: 100, def: 125, spa: 110, spd: 50, spe: 50},
        weightkg: 128.6
    },
    Electivire:
    {
        id: 466,
        uid: 484,
        name: "Electivire",
        abilities: ["motordrive"],
        types: ["electric", "???"],
        baseStats: {hp: 75, atk: 123, def: 67, spa: 95, spd: 85, spe: 95},
        weightkg: 138.6
    },
    Magmortar:
    {
        id: 467,
        uid: 485,
        name: "Magmortar",
        abilities: ["flamebody"],
        types: ["fire", "???"],
        baseStats: {hp: 75, atk: 95, def: 67, spa: 125, spd: 95, spe: 83},
        weightkg: 68
    },
    Yanmega:
    {
        id: 469,
        uid: 486,
        name: "Yanmega",
        abilities: ["speedboost", "tintedlens"],
        types: ["bug", "flying"],
        baseStats: {hp: 86, atk: 76, def: 86, spa: 116, spd: 56, spe: 95},
        weightkg: 51.5
    },
    Leafeon:
    {
        id: 470,
        uid: 487,
        name: "Leafeon",
        abilities: ["leafguard"],
        types: ["grass", "???"],
        baseStats: {hp: 65, atk: 110, def: 130, spa: 60, spd: 65, spe: 95},
        weightkg: 25.5
    },
    Glaceon:
    {
        id: 471,
        uid: 488,
        name: "Glaceon",
        abilities: ["snowcloak"],
        types: ["ice", "???"],
        baseStats: {hp: 65, atk: 60, def: 110, spa: 130, spd: 95, spe: 65},
        weightkg: 25.9
    },
    Gliscor:
    {
        id: 472,
        uid: 489,
        name: "Gliscor",
        abilities: ["hypercutter", "sandveil"],
        types: ["ground", "flying"],
        baseStats: {hp: 75, atk: 95, def: 125, spa: 45, spd: 75, spe: 95},
        weightkg: 42.5
    },
    Mamoswine:
    {
        id: 473,
        uid: 490,
        name: "Mamoswine",
        abilities: ["oblivious", "snowcloak"],
        types: ["ice", "ground"],
        baseStats: {hp: 110, atk: 130, def: 80, spa: 70, spd: 60, spe: 80},
        weightkg: 291
    },
    "Porygon-Z":
    {
        id: 474,
        uid: 491,
        name: "Porygon-Z",
        abilities: ["adaptability", "download"],
        types: ["normal", "???"],
        baseStats: {hp: 85, atk: 80, def: 70, spa: 135, spd: 75, spe: 90},
        weightkg: 34
    },
    Gallade:
    {
        id: 475,
        uid: 492,
        name: "Gallade",
        abilities: ["steadfast"],
        types: ["psychic", "fighting"],
        baseStats: {hp: 68, atk: 125, def: 65, spa: 65, spd: 115, spe: 80},
        weightkg: 52
    },
    Probopass:
    {
        id: 476,
        uid: 493,
        name: "Probopass",
        abilities: ["sturdy", "magnetpull"],
        types: ["rock", "steel"],
        baseStats: {hp: 60, atk: 55, def: 145, spa: 75, spd: 150, spe: 40},
        weightkg: 340
    },
    Froslass:
    {
        id: 478,
        uid: 494,
        name: "Froslass",
        abilities: ["snowcloak"],
        types: ["ice", "ghost"],
        baseStats: {hp: 70, atk: 80, def: 70, spa: 80, spd: 70, spe: 110},
        weightkg: 26.6
    },
    Rotom:
    {
        id: 479,
        uid: 495,
        name: "Rotom",
        otherForms: ["rotomheat", "rotomwash", "rotomfrost", "rotomfan", "rotommow"],
        abilities: ["levitate"],
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 50, def: 77, spa: 95, spd: 77, spe: 91},
        weightkg: 0.3
    },
    Uxie:
    {
        id: 480,
        uid: 496,
        name: "Uxie",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 75, atk: 75, def: 130, spa: 75, spd: 130, spe: 95},
        weightkg: 0.3
    },
    Mesprit:
    {
        id: 481,
        uid: 497,
        name: "Mesprit",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 80, atk: 105, def: 105, spa: 105, spd: 105, spe: 80},
        weightkg: 0.3
    },
    Azelf:
    {
        id: 482,
        uid: 498,
        name: "Azelf",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 75, atk: 125, def: 70, spa: 125, spd: 70, spe: 115},
        weightkg: 0.3
    },
    Dialga:
    {
        id: 483,
        uid: 499,
        name: "Dialga",
        abilities: ["pressure"],
        types: ["steel", "dragon"],
        baseStats: {hp: 100, atk: 120, def: 120, spa: 150, spd: 100, spe: 90},
        weightkg: 683
    },
    Palkia:
    {
        id: 484,
        uid: 500,
        name: "Palkia",
        abilities: ["pressure"],
        types: ["water", "dragon"],
        baseStats: {hp: 90, atk: 120, def: 100, spa: 150, spd: 120, spe: 100},
        weightkg: 336
    },
    Regigigas:
    {
        id: 486,
        uid: 501,
        name: "Regigigas",
        abilities: ["slowstart"],
        types: ["normal", "???"],
        baseStats: {hp: 110, atk: 160, def: 110, spa: 80, spd: 110, spe: 100},
        weightkg: 420
    },
    Giratina:
    {
        id: 487,
        uid: 502,
        name: "Giratina",
        baseForm: "Altered",
        otherForms: ["giratinaorigin"],
        abilities: ["pressure"],
        types: ["ghost", "dragon"],
        baseStats: {hp: 150, atk: 100, def: 120, spa: 100, spd: 120, spe: 90},
        weightkg: 750
    },
    "Giratina-Origin":
    {
        id: 487,
        uid: 503,
        name: "Giratina-Origin",
        baseSpecies: "Giratina",
        form: "Origin",
        formLetter: "O",
        abilities: ["levitate"],
        types: ["ghost", "dragon"],
        baseStats: {hp: 150, atk: 120, def: 100, spa: 120, spd: 100, spe: 90},
        weightkg: 650
    },
    Cresselia:
    {
        id: 488,
        uid: 504,
        name: "Cresselia",
        abilities: ["levitate"],
        types: ["psychic", "???"],
        baseStats: {hp: 120, atk: 70, def: 120, spa: 75, spd: 130, spe: 85},
        weightkg: 85.6
    },
    Phione:
    {
        id: 489,
        uid: 505,
        name: "Phione",
        abilities: ["hydration"],
        types: ["water", "???"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
        weightkg: 3.1
    },
    Manaphy:
    {
        id: 490,
        uid: 506,
        name: "Manaphy",
        abilities: ["hydration"],
        types: ["water", "???"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 1.4
    },
    Darkrai:
    {
        id: 491,
        uid: 507,
        name: "Darkrai",
        abilities: ["baddreams"],
        types: ["dark", "???"],
        baseStats: {hp: 70, atk: 90, def: 90, spa: 135, spd: 90, spe: 125},
        weightkg: 50.5
    },
    Shaymin:
    {
        id: 492,
        uid: 508,
        name: "Shaymin",
        baseForm: "Land",
        otherForms: ["shayminsky"],
        abilities: ["naturalcure"],
        types: ["grass", "???"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 2.1
    },
    "Shaymin-Sky":
    {
        id: 492,
        uid: 509,
        name: "Shaymin-Sky",
        baseSpecies: "Shaymin",
        form: "Sky",
        formLetter: "S",
        abilities: ["serenegrace"],
        types: ["grass", "flying"],
        baseStats: {hp: 100, atk: 103, def: 75, spa: 120, spd: 75, spe: 127},
        weightkg: 5.2
    },
    "Arceus-Bug":
    {
        id: 493,
        uid: 510,
        name: "Arceus-Bug",
        baseSpecies: "Arceus",
        form: "Bug",
        formLetter: "B",
        abilities: ["multitype"],
        types: ["bug", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Dark":
    {
        id: 493,
        uid: 511,
        name: "Arceus-Dark",
        baseSpecies: "Arceus",
        form: "Dark",
        formLetter: "D",
        abilities: ["multitype"],
        types: ["dark", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Dragon":
    {
        id: 493,
        uid: 512,
        name: "Arceus-Dragon",
        baseSpecies: "Arceus",
        form: "Dragon",
        formLetter: "D",
        abilities: ["multitype"],
        types: ["dragon", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Electric":
    {
        id: 493,
        uid: 513,
        name: "Arceus-Electric",
        baseSpecies: "Arceus",
        form: "Electric",
        formLetter: "E",
        abilities: ["multitype"],
        types: ["electric", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Fighting":
    {
        id: 493,
        uid: 514,
        name: "Arceus-Fighting",
        baseSpecies: "Arceus",
        form: "Fighting",
        formLetter: "F",
        abilities: ["multitype"],
        types: ["fighting", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Fire":
    {
        id: 493,
        uid: 515,
        name: "Arceus-Fire",
        baseSpecies: "Arceus",
        form: "Fire",
        formLetter: "F",
        abilities: ["multitype"],
        types: ["fire", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Flying":
    {
        id: 493,
        uid: 516,
        name: "Arceus-Flying",
        baseSpecies: "Arceus",
        form: "Flying",
        formLetter: "F",
        abilities: ["multitype"],
        types: ["flying", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Ghost":
    {
        id: 493,
        uid: 517,
        name: "Arceus-Ghost",
        baseSpecies: "Arceus",
        form: "Ghost",
        formLetter: "G",
        abilities: ["multitype"],
        types: ["ghost", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Grass":
    {
        id: 493,
        uid: 518,
        name: "Arceus-Grass",
        baseSpecies: "Arceus",
        form: "Grass",
        formLetter: "G",
        abilities: ["multitype"],
        types: ["grass", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Ground":
    {
        id: 493,
        uid: 519,
        name: "Arceus-Ground",
        baseSpecies: "Arceus",
        form: "Ground",
        formLetter: "G",
        abilities: ["multitype"],
        types: ["ground", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Ice":
    {
        id: 493,
        uid: 520,
        name: "Arceus-Ice",
        baseSpecies: "Arceus",
        form: "Ice",
        formLetter: "I",
        abilities: ["multitype"],
        types: ["ice", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Poison":
    {
        id: 493,
        uid: 521,
        name: "Arceus-Poison",
        baseSpecies: "Arceus",
        form: "Poison",
        formLetter: "P",
        abilities: ["multitype"],
        types: ["poison", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Psychic":
    {
        id: 493,
        uid: 522,
        name: "Arceus-Psychic",
        baseSpecies: "Arceus",
        form: "Psychic",
        formLetter: "P",
        abilities: ["multitype"],
        types: ["psychic", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Rock":
    {
        id: 493,
        uid: 523,
        name: "Arceus-Rock",
        baseSpecies: "Arceus",
        form: "Rock",
        formLetter: "R",
        abilities: ["multitype"],
        types: ["rock", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Steel":
    {
        id: 493,
        uid: 524,
        name: "Arceus-Steel",
        baseSpecies: "Arceus",
        form: "Steel",
        formLetter: "S",
        abilities: ["multitype"],
        types: ["steel", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    "Arceus-Water":
    {
        id: 493,
        uid: 525,
        name: "Arceus-Water",
        baseSpecies: "Arceus",
        form: "Water",
        formLetter: "W",
        abilities: ["multitype"],
        types: ["water", "???"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    }
};

const abilities: {readonly [name: string]: number} =
{
    marvelscale: 0,
    levitate: 1,
    compoundeyes: 2,
    swarm: 3,
    keeneye: 4,
    tangledfeet: 5,
    static: 6,
    poisonpoint: 7,
    rivalry: 8,
    cutecharm: 9,
    magicguard: 10,
    chlorophyll: 11,
    waterabsorb: 12,
    damp: 13,
    synchronize: 14,
    innerfocus: 15,
    rockhead: 16,
    sturdy: 17,
    soundproof: 18,
    filter: 19,
    pressure: 20,
    overgrow: 21,
    blaze: 22,
    torrent: 23,
    hustle: 24,
    serenegrace: 25,
    thickfat: 26,
    hugepower: 27,
    leafguard: 28,
    intimidate: 29,
    runaway: 30,
    quickfeet: 31,
    trace: 32,
    hypercutter: 33,
    plus: 34,
    minus: 35,
    colorchange: 36,
    clearbody: 37,
    naturalcure: 38,
    flashfire: 39,
    shedskin: 40,
    sandveil: 41,
    arenatrap: 42,
    earlybird: 43,
    insomnia: 44,
    swiftswim: 45,
    magmaarmor: 46,
    flamebody: 47,
    guts: 48,
    normalize: 49,
    illuminate: 50,
    oblivious: 51,
    tintedlens: 52,
    whitesmoke: 53,
    forecast: 54,
    anticipation: 55,
    flowergift: 56,
    multitype: 57,
    shielddust: 58,
    effectspore: 59,
    dryskin: 60,
    pickup: 61,
    technician: 62,
    limber: 63,
    cloudnine: 64,
    vitalspirit: 65,
    angerpoint: 66,
    noguard: 67,
    liquidooze: 68,
    owntempo: 69,
    magnetpull: 70,
    hydration: 71,
    stench: 72,
    stickyhold: 73,
    shellarmor: 74,
    skilllink: 75,
    forewarn: 76,
    lightningrod: 77,
    reckless: 78,
    ironfist: 79,
    scrappy: 80,
    sniper: 81,
    waterveil: 82,
    moldbreaker: 83,
    adaptability: 84,
    voltabsorb: 85,
    download: 86,
    battlearmor: 87,
    immunity: 88,
    solarpower: 89,
    speedboost: 90,
    superluck: 91,
    shadowtag: 92,
    gluttony: 93,
    snowcloak: 94,
    suctioncups: 95,
    frisk: 96,
    steadfast: 97,
    sandstream: 98,
    raindish: 99,
    poisonheal: 100,
    truant: 101,
    wonderguard: 102,
    stall: 103,
    purepower: 104,
    roughskin: 105,
    simple: 106,
    solidrock: 107,
    icebody: 108,
    drizzle: 109,
    drought: 110,
    airlock: 111,
    unaware: 112,
    honeygather: 113,
    stormdrain: 114,
    aftermath: 115,
    unburden: 116,
    klutz: 117,
    heatproof: 118,
    snowwarning: 119,
    motordrive: 120,
    slowstart: 121,
    baddreams: 122
};

const moves: {readonly [name: string]: MoveData} =
{
    absorb:
    {
        uid: 0, pp: 40, target: "normal"
    },
    acupressure:
    {
        uid: 1, pp: 48, target: "adjacentAllyOrSelf"
    },
    armthrust:
    {
        uid: 2, pp: 32, target: "normal"
    },
    aromatherapy:
    {
        uid: 3, pp: 8, target: "allyTeam"
    },
    aquaring:
    {
        uid: 4, pp: 32, target: "self"
    },
    assist:
    {
        uid: 5, pp: 32, target: "self"
    },
    assurance:
    {
        uid: 6, pp: 16, target: "normal"
    },
    avalanche:
    {
        uid: 7, pp: 16, target: "normal"
    },
    barrage:
    {
        uid: 8, pp: 32, target: "normal"
    },
    beatup:
    {
        uid: 9, pp: 16, target: "normal"
    },
    bide:
    {
        uid: 10, pp: 16, target: "self"
    },
    bind:
    {
        uid: 11, pp: 32, target: "normal"
    },
    block:
    {
        uid: 12, pp: 8, target: "normal"
    },
    bonerush:
    {
        uid: 13, pp: 16, target: "normal"
    },
    bonemerang:
    {
        uid: 14, pp: 16, target: "normal"
    },
    bounce:
    {
        uid: 15, pp: 8, target: "any"
    },
    bravebird:
    {
        uid: 16, pp: 24, target: "any"
    },
    brickbreak:
    {
        uid: 17, pp: 24, target: "normal"
    },
    bugbite:
    {
        uid: 18, pp: 32, target: "normal"
    },
    bulletseed:
    {
        uid: 19, pp: 48, target: "normal"
    },
    camouflage:
    {
        uid: 20, pp: 32, target: "self"
    },
    chatter:
    {
        uid: 21, pp: 32, target: "any"
    },
    clamp:
    {
        uid: 22, pp: 16, target: "normal"
    },
    cometpunch:
    {
        uid: 23, pp: 24, target: "normal"
    },
    conversion:
    {
        uid: 24, pp: 48, target: "self"
    },
    conversion2:
    {
        uid: 25, pp: 48, target: "normal"
    },
    copycat:
    {
        uid: 26, pp: 32, target: "self"
    },
    cottonspore:
    {
        uid: 27, pp: 64, target: "normal"
    },
    counter:
    {
        uid: 28, pp: 32, target: "scripted"
    },
    covet:
    {
        uid: 29, pp: 64, target: "normal"
    },
    crabhammer:
    {
        uid: 30, pp: 16, target: "normal"
    },
    crushgrip:
    {
        uid: 31, pp: 8, target: "normal"
    },
    curse:
    {
        uid: 32, pp: 16, target: "normal"
    },
    defog:
    {
        uid: 33, pp: 24, target: "normal"
    },
    detect:
    {
        uid: 34, pp: 8, target: "self"
    },
    dig:
    {
        uid: 35, pp: 16, target: "normal"
    },
    disable:
    {
        uid: 36, pp: 32, target: "normal"
    },
    dive:
    {
        uid: 37, pp: 16, target: "normal"
    },
    doomdesire:
    {
        uid: 38, pp: 8, target: "normal"
    },
    doubleedge:
    {
        uid: 39, pp: 24, target: "normal"
    },
    doublehit:
    {
        uid: 40, pp: 16, target: "normal"
    },
    doublekick:
    {
        uid: 41, pp: 48, target: "normal"
    },
    doubleslap:
    {
        uid: 42, pp: 16, target: "normal"
    },
    drainpunch:
    {
        uid: 43, pp: 8, target: "normal"
    },
    dreameater:
    {
        uid: 44, pp: 24, target: "normal"
    },
    earthquake:
    {
        uid: 45, pp: 16, target: "allAdjacent"
    },
    embargo:
    {
        uid: 46, pp: 24, target: "normal"
    },
    encore:
    {
        uid: 47, pp: 8, target: "normal"
    },
    endeavor:
    {
        uid: 48, pp: 8, target: "normal"
    },
    endure:
    {
        uid: 49, pp: 16, target: "self"
    },
    explosion:
    {
        uid: 50, pp: 8, target: "allAdjacent"
    },
    extremespeed:
    {
        uid: 51, pp: 8, target: "normal"
    },
    fakeout:
    {
        uid: 52, pp: 16, target: "normal"
    },
    feint:
    {
        uid: 53, pp: 16, target: "normal"
    },
    firefang:
    {
        uid: 54, pp: 24, target: "normal"
    },
    firespin:
    {
        uid: 55, pp: 24, target: "normal"
    },
    flail:
    {
        uid: 56, pp: 24, target: "normal"
    },
    flareblitz:
    {
        uid: 57, pp: 24, target: "normal"
    },
    fling:
    {
        uid: 58, pp: 16, target: "normal"
    },
    fly:
    {
        uid: 59, pp: 24, target: "any"
    },
    focuspunch:
    {
        uid: 60, pp: 32, target: "normal"
    },
    followme:
    {
        uid: 61, pp: 32, target: "self"
    },
    foresight:
    {
        uid: 62, pp: 64, target: "normal"
    },
    furyattack:
    {
        uid: 63, pp: 32, target: "normal"
    },
    furycutter:
    {
        uid: 64, pp: 32, target: "normal"
    },
    furyswipes:
    {
        uid: 65, pp: 24, target: "normal"
    },
    futuresight:
    {
        uid: 66, pp: 24, target: "normal"
    },
    gigadrain:
    {
        uid: 67, pp: 16, target: "normal"
    },
    glare:
    {
        uid: 68, pp: 48, target: "normal"
    },
    gravity:
    {
        uid: 69, pp: 8, target: "all"
    },
    growth:
    {
        uid: 70, pp: 64, target: "self"
    },
    gust:
    {
        uid: 71, pp: 56, target: "any"
    },
    hail:
    {
        uid: 72, pp: 16, target: "all"
    },
    headsmash:
    {
        uid: 73, pp: 8, target: "normal"
    },
    healbell:
    {
        uid: 74, pp: 8, target: "allyTeam"
    },
    healblock:
    {
        uid: 75, pp: 24, target: "allAdjacentFoes"
    },
    healingwish:
    {
        uid: 76, pp: 16, target: "self"
    },
    healorder:
    {
        uid: 77, pp: 16, target: "self"
    },
    highjumpkick:
    {
        uid: 78, pp: 32, target: "normal"
    },
    iciclespear:
    {
        uid: 79, pp: 48, target: "normal"
    },
    imprison:
    {
        uid: 80, pp: 16, target: "self"
    },
    ingrain:
    {
        uid: 81, pp: 32, target: "self"
    },
    jumpkick:
    {
        uid: 82, pp: 40, target: "normal"
    },
    knockoff:
    {
        uid: 83, pp: 32, target: "normal"
    },
    lastresort:
    {
        uid: 84, pp: 8, target: "normal"
    },
    leechlife:
    {
        uid: 85, pp: 24, target: "normal"
    },
    lightscreen:
    {
        uid: 86, pp: 48, target: "allySide", sideCondition: "lightscreen"
    },
    lockon:
    {
        uid: 87, pp: 8, target: "normal"
    },
    luckychant:
    {
        uid: 88, pp: 48, target: "allySide", sideCondition: "luckychant"
    },
    lunardance:
    {
        uid: 89, pp: 16, target: "self", sideCondition: "lunardance"
    },
    magiccoat:
    {
        uid: 90, pp: 24, target: "self"
    },
    magmastorm:
    {
        uid: 91, pp: 8, target: "normal"
    },
    magnetrise:
    {
        uid: 92, pp: 16, target: "self"
    },
    magnitude:
    {
        uid: 93, pp: 48, target: "allAdjacent"
    },
    meanlook:
    {
        uid: 94, pp: 8, target: "normal"
    },
    mefirst:
    {
        uid: 95, pp: 32, target: "adjacentFoe"
    },
    megadrain:
    {
        uid: 96, pp: 24, target: "normal"
    },
    memento:
    {
        uid: 97, pp: 16, target: "normal"
    },
    metalburst:
    {
        uid: 98, pp: 16, target: "scripted"
    },
    metronome:
    {
        uid: 99, pp: 16, target: "self"
    },
    milkdrink:
    {
        uid: 100, pp: 16, target: "self"
    },
    mimic:
    {
        uid: 101, pp: 16, target: "normal"
    },
    mindreader:
    {
        uid: 102, pp: 8, target: "normal"
    },
    minimize:
    {
        uid: 103, pp: 32, target: "self"
    },
    miracleeye:
    {
        uid: 104, pp: 64, target: "normal"
    },
    mirrorcoat:
    {
        uid: 105, pp: 32, target: "scripted"
    },
    mirrormove:
    {
        uid: 106, pp: 32, target: "self"
    },
    moonlight:
    {
        uid: 107, pp: 8, target: "self"
    },
    morningsun:
    {
        uid: 108, pp: 8, target: "self"
    },
    mudsport:
    {
        uid: 109, pp: 24, target: "all"
    },
    naturalgift:
    {
        uid: 110, pp: 24, target: "normal"
    },
    naturepower:
    {
        uid: 111, pp: 32, target: "self"
    },
    odorsleuth:
    {
        uid: 112, pp: 64, target: "normal"
    },
    outrage:
    {
        uid: 113, pp: 24, target: "randomNormal", volatileEffect: "lockedmove"
    },
    payback:
    {
        uid: 114, pp: 16, target: "normal"
    },
    petaldance:
    {
        uid: 115, pp: 32, target: "randomNormal", volatileEffect: "lockedmove"
    },
    pinmissile:
    {
        uid: 116, pp: 32, target: "normal"
    },
    pluck:
    {
        uid: 117, pp: 32, target: "any"
    },
    poisongas:
    {
        uid: 118, pp: 64, target: "normal"
    },
    powertrick:
    {
        uid: 119, pp: 16, target: "self"
    },
    protect:
    {
        uid: 120, pp: 16, target: "self"
    },
    psychup:
    {
        uid: 121, pp: 16, target: "normal"
    },
    psywave:
    {
        uid: 122, pp: 24, target: "normal"
    },
    pursuit:
    {
        uid: 123, pp: 32, target: "normal"
    },
    rapidspin:
    {
        uid: 124, pp: 64, target: "normal"
    },
    razorwind:
    {
        uid: 125, pp: 16, target: "allAdjacentFoes"
    },
    recover:
    {
        uid: 126, pp: 16, target: "self"
    },
    recycle:
    {
        uid: 127, pp: 16, target: "self"
    },
    reflect:
    {
        uid: 128, pp: 32, target: "allySide", sideCondition: "reflect"
    },
    revenge:
    {
        uid: 129, pp: 16, target: "normal"
    },
    reversal:
    {
        uid: 130, pp: 24, target: "normal"
    },
    roar:
    {
        uid: 131, pp: 32, target: "normal"
    },
    rockblast:
    {
        uid: 132, pp: 16, target: "normal"
    },
    roleplay:
    {
        uid: 133, pp: 16, target: "normal"
    },
    roost:
    {
        uid: 134, pp: 16, target: "self", volatileEffect: "roost"
    },
    sandtomb:
    {
        uid: 135, pp: 24, target: "normal"
    },
    sandstorm:
    {
        uid: 136, pp: 16, target: "all"
    },
    scaryface:
    {
        uid: 137, pp: 16, target: "normal"
    },
    secretpower:
    {
        uid: 138, pp: 32, target: "normal"
    },
    selfdestruct:
    {
        uid: 139, pp: 8, target: "allAdjacent"
    },
    sketch:
    {
        uid: 140, pp: 1, target: "normal"
    },
    skillswap:
    {
        uid: 141, pp: 16, target: "normal"
    },
    skyuppercut:
    {
        uid: 142, pp: 24, target: "normal"
    },
    slackoff:
    {
        uid: 143, pp: 16, target: "self"
    },
    sleeptalk:
    {
        uid: 144, pp: 16, target: "self"
    },
    smellingsalts:
    {
        uid: 145, pp: 16, target: "normal"
    },
    snatch:
    {
        uid: 146, pp: 16, target: "self"
    },
    softboiled:
    {
        uid: 147, pp: 16, target: "self"
    },
    solarbeam:
    {
        uid: 148, pp: 16, target: "normal"
    },
    spiderweb:
    {
        uid: 149, pp: 16, target: "normal"
    },
    spikecannon:
    {
        uid: 150, pp: 24, target: "normal"
    },
    spikes:
    {
        uid: 151, pp: 32, target: "foeSide", sideCondition: "spikes"
    },
    spite:
    {
        uid: 152, pp: 16, target: "normal"
    },
    spitup:
    {
        uid: 153, pp: 16, target: "normal"
    },
    stealthrock:
    {
        uid: 154, pp: 32, target: "foeSide", sideCondition: "stealthrock"
    },
    stomp:
    {
        uid: 155, pp: 32, target: "normal"
    },
    struggle:
    {
        uid: 156, pp: 1, target: "randomNormal"
    },
    submission:
    {
        uid: 157, pp: 40, target: "normal"
    },
    substitute:
    {
        uid: 158, pp: 16, target: "self"
    },
    suckerpunch:
    {
        uid: 159, pp: 8, target: "normal"
    },
    surf:
    {
        uid: 160, pp: 24, target: "allAdjacent"
    },
    swallow:
    {
        uid: 161, pp: 16, target: "self"
    },
    switcheroo:
    {
        uid: 162, pp: 16, target: "normal"
    },
    synthesis:
    {
        uid: 163, pp: 8, target: "self"
    },
    tackle:
    {
        uid: 164, pp: 56, target: "normal"
    },
    tailglow:
    {
        uid: 165, pp: 32, target: "self"
    },
    tailwind:
    {
        uid: 166, pp: 48, target: "allySide", sideCondition: "tailwind"
    },
    takedown:
    {
        uid: 167, pp: 32, target: "normal"
    },
    taunt:
    {
        uid: 168, pp: 32, target: "normal"
    },
    thief:
    {
        uid: 169, pp: 16, target: "normal"
    },
    thrash:
    {
        uid: 170, pp: 32, target: "randomNormal", volatileEffect: "lockedmove"
    },
    thunder:
    {
        uid: 171, pp: 16, target: "normal"
    },
    torment:
    {
        uid: 172, pp: 24, target: "normal"
    },
    toxic:
    {
        uid: 173, pp: 16, target: "normal"
    },
    toxicspikes:
    {
        uid: 174, pp: 32, target: "foeSide", sideCondition: "toxicspikes"
    },
    transform:
    {
        uid: 175, pp: 16, target: "normal"
    },
    trick:
    {
        uid: 176, pp: 16, target: "normal"
    },
    trickroom:
    {
        uid: 177, pp: 8, target: "all"
    },
    triplekick:
    {
        uid: 178, pp: 16, target: "normal"
    },
    twineedle:
    {
        uid: 179, pp: 32, target: "normal"
    },
    twister:
    {
        uid: 180, pp: 32, target: "allAdjacentFoes"
    },
    uproar:
    {
        uid: 181, pp: 16, target: "randomNormal", volatileEffect: "uproar"
    },
    uturn:
    {
        uid: 182, pp: 32, target: "normal", selfSwitch: true
    },
    volttackle:
    {
        uid: 183, pp: 24, target: "normal"
    },
    wakeupslap:
    {
        uid: 184, pp: 16, target: "normal"
    },
    watersport:
    {
        uid: 185, pp: 24, target: "all"
    },
    whirlpool:
    {
        uid: 186, pp: 24, target: "normal"
    },
    whirlwind:
    {
        uid: 187, pp: 32, target: "normal"
    },
    wish:
    {
        uid: 188, pp: 16, target: "self"
    },
    woodhammer:
    {
        uid: 189, pp: 24, target: "normal"
    },
    worryseed:
    {
        uid: 190, pp: 16, target: "normal"
    },
    wrap:
    {
        uid: 191, pp: 32, target: "normal"
    },
    wringout:
    {
        uid: 192, pp: 8, target: "normal"
    },
    acidarmor:
    {
        uid: 193, pp: 64, target: "self"
    },
    aircutter:
    {
        uid: 194, pp: 40, target: "allAdjacentFoes"
    },
    airslash:
    {
        uid: 195, pp: 32, target: "any"
    },
    attract:
    {
        uid: 196, pp: 24, target: "normal"
    },
    aurasphere:
    {
        uid: 197, pp: 32, target: "any"
    },
    barrier:
    {
        uid: 198, pp: 48, target: "self"
    },
    blizzard:
    {
        uid: 199, pp: 8, target: "allAdjacentFoes"
    },
    bodyslam:
    {
        uid: 200, pp: 24, target: "normal"
    },
    bubble:
    {
        uid: 201, pp: 48, target: "allAdjacentFoes"
    },
    bugbuzz:
    {
        uid: 202, pp: 16, target: "normal"
    },
    charm:
    {
        uid: 203, pp: 32, target: "normal"
    },
    dracometeor:
    {
        uid: 204, pp: 8, target: "normal"
    },
    dragonpulse:
    {
        uid: 205, pp: 16, target: "any"
    },
    dragonrush:
    {
        uid: 206, pp: 16, target: "normal"
    },
    energyball:
    {
        uid: 207, pp: 16, target: "normal"
    },
    extrasensory:
    {
        uid: 208, pp: 48, target: "normal"
    },
    facade:
    {
        uid: 209, pp: 32, target: "normal"
    },
    fireblast:
    {
        uid: 210, pp: 8, target: "normal"
    },
    flamethrower:
    {
        uid: 211, pp: 24, target: "normal"
    },
    grasswhistle:
    {
        uid: 212, pp: 24, target: "normal"
    },
    growl:
    {
        uid: 213, pp: 64, target: "allAdjacentFoes"
    },
    gunkshot:
    {
        uid: 214, pp: 8, target: "normal"
    },
    gyroball:
    {
        uid: 215, pp: 8, target: "normal"
    },
    heatwave:
    {
        uid: 216, pp: 16, target: "allAdjacentFoes"
    },
    hiddenpower:
    {
        uid: 217, pp: 24, target: "normal"
    },
    hydropump:
    {
        uid: 218, pp: 8, target: "normal"
    },
    hypervoice:
    {
        uid: 219, pp: 16, target: "allAdjacentFoes"
    },
    icebeam:
    {
        uid: 220, pp: 16, target: "normal"
    },
    leafstorm:
    {
        uid: 221, pp: 8, target: "normal"
    },
    lick:
    {
        uid: 222, pp: 48, target: "normal"
    },
    metalsound:
    {
        uid: 223, pp: 64, target: "normal"
    },
    meteormash:
    {
        uid: 224, pp: 16, target: "normal"
    },
    muddywater:
    {
        uid: 225, pp: 16, target: "allAdjacentFoes"
    },
    overheat:
    {
        uid: 226, pp: 8, target: "normal"
    },
    perishsong:
    {
        uid: 227, pp: 8, target: "all"
    },
    poisonfang:
    {
        uid: 228, pp: 24, target: "normal"
    },
    poisonpowder:
    {
        uid: 229, pp: 56, target: "normal"
    },
    powergem:
    {
        uid: 230, pp: 32, target: "normal"
    },
    psychoshift:
    {
        uid: 231, pp: 16, target: "normal"
    },
    rocktomb:
    {
        uid: 232, pp: 16, target: "normal"
    },
    screech:
    {
        uid: 233, pp: 64, target: "normal"
    },
    shadowforce:
    {
        uid: 234, pp: 8, target: "normal"
    },
    sing:
    {
        uid: 235, pp: 24, target: "normal"
    },
    skullbash:
    {
        uid: 236, pp: 24, target: "normal"
    },
    sleeppowder:
    {
        uid: 237, pp: 24, target: "normal"
    },
    smog:
    {
        uid: 238, pp: 32, target: "normal"
    },
    snore:
    {
        uid: 239, pp: 24, target: "normal"
    },
    spore:
    {
        uid: 240, pp: 24, target: "normal"
    },
    stringshot:
    {
        uid: 241, pp: 64, target: "allAdjacentFoes"
    },
    stunspore:
    {
        uid: 242, pp: 48, target: "normal"
    },
    supersonic:
    {
        uid: 243, pp: 32, target: "normal"
    },
    sweetkiss:
    {
        uid: 244, pp: 16, target: "normal"
    },
    sweetscent:
    {
        uid: 245, pp: 32, target: "allAdjacentFoes"
    },
    swordsdance:
    {
        uid: 246, pp: 48, target: "self"
    },
    thunderbolt:
    {
        uid: 247, pp: 24, target: "normal"
    },
    vinewhip:
    {
        uid: 248, pp: 24, target: "normal"
    },
    weatherball:
    {
        uid: 249, pp: 16, target: "normal"
    },
    willowisp:
    {
        uid: 250, pp: 24, target: "normal"
    },
    darkvoid:
    {
        uid: 251, pp: 16, target: "allAdjacentFoes"
    },
    destinybond:
    {
        uid: 252, pp: 8, target: "self"
    },
    gastroacid:
    {
        uid: 253, pp: 16, target: "normal"
    },
    iceball:
    {
        uid: 254, pp: 32, target: "normal"
    },
    rollout:
    {
        uid: 255, pp: 32, target: "normal"
    },
    sheercold:
    {
        uid: 256, pp: 8, target: "normal"
    },
    stockpile:
    {
        uid: 257, pp: 32, target: "self"
    },
    swagger:
    {
        uid: 258, pp: 24, target: "normal"
    },
    thunderwave:
    {
        uid: 259, pp: 32, target: "normal"
    },
    acid:
    {
        uid: 260, pp: 48, target: "allAdjacentFoes"
    },
    aerialace:
    {
        uid: 261, pp: 32, target: "any"
    },
    aeroblast:
    {
        uid: 262, pp: 8, target: "any"
    },
    agility:
    {
        uid: 263, pp: 48, target: "self"
    },
    amnesia:
    {
        uid: 264, pp: 32, target: "self"
    },
    ancientpower:
    {
        uid: 265, pp: 8, target: "normal"
    },
    aquajet:
    {
        uid: 266, pp: 32, target: "normal"
    },
    aquatail:
    {
        uid: 267, pp: 16, target: "normal"
    },
    astonish:
    {
        uid: 268, pp: 24, target: "normal"
    },
    attackorder:
    {
        uid: 269, pp: 24, target: "normal"
    },
    aurorabeam:
    {
        uid: 270, pp: 32, target: "normal"
    },
    batonpass:
    {
        uid: 271, pp: 64, target: "self", selfSwitch: "copyvolatile"
    },
    bellydrum:
    {
        uid: 272, pp: 16, target: "self"
    },
    bite:
    {
        uid: 273, pp: 40, target: "normal"
    },
    blastburn:
    {
        uid: 274, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    blazekick:
    {
        uid: 275, pp: 16, target: "normal"
    },
    boneclub:
    {
        uid: 276, pp: 32, target: "normal"
    },
    brine:
    {
        uid: 277, pp: 16, target: "normal"
    },
    bubblebeam:
    {
        uid: 278, pp: 32, target: "normal"
    },
    bulkup:
    {
        uid: 279, pp: 32, target: "self"
    },
    bulletpunch:
    {
        uid: 280, pp: 48, target: "normal"
    },
    calmmind:
    {
        uid: 281, pp: 32, target: "self"
    },
    captivate:
    {
        uid: 282, pp: 32, target: "allAdjacentFoes"
    },
    charge:
    {
        uid: 283, pp: 32, target: "self"
    },
    chargebeam:
    {
        uid: 284, pp: 16, target: "normal"
    },
    closecombat:
    {
        uid: 285, pp: 8, target: "normal"
    },
    confuseray:
    {
        uid: 286, pp: 16, target: "normal"
    },
    confusion:
    {
        uid: 287, pp: 40, target: "normal"
    },
    constrict:
    {
        uid: 288, pp: 56, target: "normal"
    },
    cosmicpower:
    {
        uid: 289, pp: 32, target: "self"
    },
    crosschop:
    {
        uid: 290, pp: 8, target: "normal"
    },
    crosspoison:
    {
        uid: 291, pp: 32, target: "normal"
    },
    crunch:
    {
        uid: 292, pp: 24, target: "normal"
    },
    crushclaw:
    {
        uid: 293, pp: 16, target: "normal"
    },
    cut:
    {
        uid: 294, pp: 48, target: "normal"
    },
    darkpulse:
    {
        uid: 295, pp: 24, target: "any"
    },
    defendorder:
    {
        uid: 296, pp: 16, target: "self"
    },
    defensecurl:
    {
        uid: 297, pp: 64, target: "self"
    },
    discharge:
    {
        uid: 298, pp: 24, target: "allAdjacent"
    },
    dizzypunch:
    {
        uid: 299, pp: 16, target: "normal"
    },
    doubleteam:
    {
        uid: 300, pp: 24, target: "self"
    },
    dragonbreath:
    {
        uid: 301, pp: 32, target: "normal"
    },
    dragonclaw:
    {
        uid: 302, pp: 24, target: "normal"
    },
    dragondance:
    {
        uid: 303, pp: 32, target: "self"
    },
    dragonrage:
    {
        uid: 304, pp: 16, target: "normal"
    },
    drillpeck:
    {
        uid: 305, pp: 32, target: "any"
    },
    dynamicpunch:
    {
        uid: 306, pp: 8, target: "normal"
    },
    earthpower:
    {
        uid: 307, pp: 16, target: "normal"
    },
    eggbomb:
    {
        uid: 308, pp: 16, target: "normal"
    },
    ember:
    {
        uid: 309, pp: 40, target: "normal"
    },
    eruption:
    {
        uid: 310, pp: 8, target: "allAdjacentFoes"
    },
    feintattack:
    {
        uid: 311, pp: 32, target: "normal"
    },
    faketears:
    {
        uid: 312, pp: 32, target: "normal"
    },
    falseswipe:
    {
        uid: 313, pp: 64, target: "normal"
    },
    featherdance:
    {
        uid: 314, pp: 24, target: "normal"
    },
    firepunch:
    {
        uid: 315, pp: 24, target: "normal"
    },
    fissure:
    {
        uid: 316, pp: 8, target: "normal"
    },
    flamewheel:
    {
        uid: 317, pp: 40, target: "normal"
    },
    flash:
    {
        uid: 318, pp: 32, target: "normal"
    },
    flashcannon:
    {
        uid: 319, pp: 16, target: "normal"
    },
    flatter:
    {
        uid: 320, pp: 24, target: "normal"
    },
    focusblast:
    {
        uid: 321, pp: 8, target: "normal"
    },
    focusenergy:
    {
        uid: 322, pp: 48, target: "self"
    },
    forcepalm:
    {
        uid: 323, pp: 16, target: "normal"
    },
    frenzyplant:
    {
        uid: 324, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    frustration:
    {
        uid: 325, pp: 32, target: "normal"
    },
    gigaimpact:
    {
        uid: 326, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    grassknot:
    {
        uid: 327, pp: 32, target: "normal"
    },
    grudge:
    {
        uid: 328, pp: 8, target: "self"
    },
    guardswap:
    {
        uid: 329, pp: 16, target: "normal"
    },
    guillotine:
    {
        uid: 330, pp: 8, target: "normal"
    },
    hammerarm:
    {
        uid: 331, pp: 16, target: "normal"
    },
    harden:
    {
        uid: 332, pp: 48, target: "self"
    },
    haze:
    {
        uid: 333, pp: 48, target: "all"
    },
    headbutt:
    {
        uid: 334, pp: 24, target: "normal"
    },
    heartswap:
    {
        uid: 335, pp: 16, target: "normal"
    },
    helpinghand:
    {
        uid: 336, pp: 32, target: "adjacentAlly"
    },
    hornattack:
    {
        uid: 337, pp: 40, target: "normal"
    },
    horndrill:
    {
        uid: 338, pp: 8, target: "normal"
    },
    howl:
    {
        uid: 339, pp: 64, target: "self"
    },
    hydrocannon:
    {
        uid: 340, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    hyperbeam:
    {
        uid: 341, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    hyperfang:
    {
        uid: 342, pp: 24, target: "normal"
    },
    hypnosis:
    {
        uid: 343, pp: 32, target: "normal"
    },
    icefang:
    {
        uid: 344, pp: 24, target: "normal"
    },
    icepunch:
    {
        uid: 345, pp: 24, target: "normal"
    },
    iceshard:
    {
        uid: 346, pp: 48, target: "normal"
    },
    icywind:
    {
        uid: 347, pp: 24, target: "allAdjacentFoes"
    },
    irondefense:
    {
        uid: 348, pp: 24, target: "self"
    },
    ironhead:
    {
        uid: 349, pp: 24, target: "normal"
    },
    irontail:
    {
        uid: 350, pp: 24, target: "normal"
    },
    judgment:
    {
        uid: 351, pp: 16, target: "normal"
    },
    karatechop:
    {
        uid: 352, pp: 40, target: "normal"
    },
    kinesis:
    {
        uid: 353, pp: 24, target: "normal"
    },
    lavaplume:
    {
        uid: 354, pp: 24, target: "allAdjacent"
    },
    leafblade:
    {
        uid: 355, pp: 24, target: "normal"
    },
    leechseed:
    {
        uid: 356, pp: 16, target: "normal"
    },
    leer:
    {
        uid: 357, pp: 48, target: "allAdjacentFoes"
    },
    lovelykiss:
    {
        uid: 358, pp: 16, target: "normal"
    },
    lowkick:
    {
        uid: 359, pp: 32, target: "normal"
    },
    lusterpurge:
    {
        uid: 360, pp: 8, target: "normal"
    },
    machpunch:
    {
        uid: 361, pp: 48, target: "normal"
    },
    magicalleaf:
    {
        uid: 362, pp: 32, target: "normal"
    },
    magnetbomb:
    {
        uid: 363, pp: 32, target: "normal"
    },
    meditate:
    {
        uid: 364, pp: 64, target: "self"
    },
    megakick:
    {
        uid: 365, pp: 8, target: "normal"
    },
    megapunch:
    {
        uid: 366, pp: 32, target: "normal"
    },
    megahorn:
    {
        uid: 367, pp: 16, target: "normal"
    },
    metalclaw:
    {
        uid: 368, pp: 56, target: "normal"
    },
    mirrorshot:
    {
        uid: 369, pp: 16, target: "normal"
    },
    mist:
    {
        uid: 370, pp: 48, target: "allySide", sideCondition: "mist"
    },
    mistball:
    {
        uid: 371, pp: 8, target: "normal"
    },
    mudslap:
    {
        uid: 372, pp: 16, target: "normal"
    },
    mudbomb:
    {
        uid: 373, pp: 16, target: "normal"
    },
    mudshot:
    {
        uid: 374, pp: 24, target: "normal"
    },
    nastyplot:
    {
        uid: 375, pp: 32, target: "self"
    },
    needlearm:
    {
        uid: 376, pp: 24, target: "normal"
    },
    nightshade:
    {
        uid: 377, pp: 24, target: "normal"
    },
    nightslash:
    {
        uid: 378, pp: 24, target: "normal"
    },
    nightmare:
    {
        uid: 379, pp: 24, target: "normal"
    },
    octazooka:
    {
        uid: 380, pp: 16, target: "normal"
    },
    ominouswind:
    {
        uid: 381, pp: 8, target: "normal"
    },
    painsplit:
    {
        uid: 382, pp: 32, target: "normal"
    },
    payday:
    {
        uid: 383, pp: 32, target: "normal"
    },
    peck:
    {
        uid: 384, pp: 56, target: "any"
    },
    poisonjab:
    {
        uid: 385, pp: 32, target: "normal"
    },
    poisonsting:
    {
        uid: 386, pp: 56, target: "normal"
    },
    poisontail:
    {
        uid: 387, pp: 40, target: "normal"
    },
    pound:
    {
        uid: 388, pp: 56, target: "normal"
    },
    powdersnow:
    {
        uid: 389, pp: 40, target: "allAdjacentFoes"
    },
    powerswap:
    {
        uid: 390, pp: 16, target: "normal"
    },
    powerwhip:
    {
        uid: 391, pp: 16, target: "normal"
    },
    present:
    {
        uid: 392, pp: 24, target: "normal"
    },
    psybeam:
    {
        uid: 393, pp: 32, target: "normal"
    },
    psychic:
    {
        uid: 394, pp: 16, target: "normal"
    },
    psychoboost:
    {
        uid: 395, pp: 8, target: "normal"
    },
    psychocut:
    {
        uid: 396, pp: 32, target: "normal"
    },
    punishment:
    {
        uid: 397, pp: 8, target: "normal"
    },
    quickattack:
    {
        uid: 398, pp: 48, target: "normal"
    },
    rage:
    {
        uid: 399, pp: 32, target: "normal", volatileEffect: "rage"
    },
    raindance:
    {
        uid: 400, pp: 8, target: "all"
    },
    razorleaf:
    {
        uid: 401, pp: 40, target: "allAdjacentFoes"
    },
    refresh:
    {
        uid: 402, pp: 32, target: "self"
    },
    rest:
    {
        uid: 403, pp: 16, target: "self"
    },
    return:
    {
        uid: 404, pp: 32, target: "normal"
    },
    roaroftime:
    {
        uid: 405, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    rockclimb:
    {
        uid: 406, pp: 32, target: "normal"
    },
    rockpolish:
    {
        uid: 407, pp: 32, target: "self"
    },
    rockslide:
    {
        uid: 408, pp: 16, target: "allAdjacentFoes"
    },
    rocksmash:
    {
        uid: 409, pp: 24, target: "normal"
    },
    rockthrow:
    {
        uid: 410, pp: 24, target: "normal"
    },
    rockwrecker:
    {
        uid: 411, pp: 8, target: "normal", volatileEffect: "mustrecharge"
    },
    rollingkick:
    {
        uid: 412, pp: 24, target: "normal"
    },
    sacredfire:
    {
        uid: 413, pp: 8, target: "normal"
    },
    safeguard:
    {
        uid: 414, pp: 40, target: "allySide", sideCondition: "safeguard"
    },
    sandattack:
    {
        uid: 415, pp: 24, target: "normal"
    },
    scratch:
    {
        uid: 416, pp: 56, target: "normal"
    },
    seedbomb:
    {
        uid: 417, pp: 24, target: "normal"
    },
    seedflare:
    {
        uid: 418, pp: 8, target: "normal"
    },
    seismictoss:
    {
        uid: 419, pp: 32, target: "normal"
    },
    shadowball:
    {
        uid: 420, pp: 24, target: "normal"
    },
    shadowclaw:
    {
        uid: 421, pp: 24, target: "normal"
    },
    shadowpunch:
    {
        uid: 422, pp: 32, target: "normal"
    },
    shadowsneak:
    {
        uid: 423, pp: 48, target: "normal"
    },
    sharpen:
    {
        uid: 424, pp: 48, target: "self"
    },
    shockwave:
    {
        uid: 425, pp: 32, target: "normal"
    },
    signalbeam:
    {
        uid: 426, pp: 24, target: "normal"
    },
    silverwind:
    {
        uid: 427, pp: 8, target: "normal"
    },
    skyattack:
    {
        uid: 428, pp: 8, target: "any"
    },
    slam:
    {
        uid: 429, pp: 32, target: "normal"
    },
    slash:
    {
        uid: 430, pp: 32, target: "normal"
    },
    sludge:
    {
        uid: 431, pp: 32, target: "normal"
    },
    sludgebomb:
    {
        uid: 432, pp: 16, target: "normal"
    },
    smokescreen:
    {
        uid: 433, pp: 32, target: "normal"
    },
    sonicboom:
    {
        uid: 434, pp: 32, target: "normal"
    },
    spacialrend:
    {
        uid: 435, pp: 8, target: "normal"
    },
    spark:
    {
        uid: 436, pp: 32, target: "normal"
    },
    splash:
    {
        uid: 437, pp: 64, target: "self"
    },
    steelwing:
    {
        uid: 438, pp: 40, target: "normal"
    },
    stoneedge:
    {
        uid: 439, pp: 8, target: "normal"
    },
    strength:
    {
        uid: 440, pp: 24, target: "normal"
    },
    sunnyday:
    {
        uid: 441, pp: 8, target: "all"
    },
    superfang:
    {
        uid: 442, pp: 16, target: "normal"
    },
    superpower:
    {
        uid: 443, pp: 8, target: "normal"
    },
    swift:
    {
        uid: 444, pp: 32, target: "allAdjacentFoes"
    },
    tailwhip:
    {
        uid: 445, pp: 48, target: "allAdjacentFoes"
    },
    teeterdance:
    {
        uid: 446, pp: 32, target: "allAdjacent"
    },
    teleport:
    {
        uid: 447, pp: 32, target: "self"
    },
    thunderfang:
    {
        uid: 448, pp: 24, target: "normal"
    },
    thunderpunch:
    {
        uid: 449, pp: 24, target: "normal"
    },
    thundershock:
    {
        uid: 450, pp: 48, target: "normal"
    },
    tickle:
    {
        uid: 451, pp: 32, target: "normal"
    },
    triattack:
    {
        uid: 452, pp: 16, target: "normal"
    },
    trumpcard:
    {
        uid: 453, pp: 5, target: "normal"
    },
    vacuumwave:
    {
        uid: 454, pp: 48, target: "normal"
    },
    vicegrip:
    {
        uid: 455, pp: 48, target: "normal"
    },
    vitalthrow:
    {
        uid: 456, pp: 16, target: "normal"
    },
    watergun:
    {
        uid: 457, pp: 40, target: "normal"
    },
    waterpulse:
    {
        uid: 458, pp: 32, target: "any"
    },
    waterspout:
    {
        uid: 459, pp: 8, target: "allAdjacentFoes"
    },
    waterfall:
    {
        uid: 460, pp: 24, target: "normal"
    },
    wingattack:
    {
        uid: 461, pp: 56, target: "any"
    },
    withdraw:
    {
        uid: 462, pp: 64, target: "self"
    },
    xscissor:
    {
        uid: 463, pp: 24, target: "normal"
    },
    yawn:
    {
        uid: 464, pp: 16, target: "normal"
    },
    zapcannon:
    {
        uid: 465, pp: 8, target: "normal"
    },
    zenheadbutt:
    {
        uid: 466, pp: 24, target: "normal"
    }
};

const twoTurnMovesInternal =
{
    bounce: 0,
    dig: 1,
    dive: 2,
    fly: 3,
    razorwind: 4,
    solarbeam: 5,
    shadowforce: 6,
    skullbash: 7,
    skyattack: 8
};

/** Set of all two-turn moves. Maps move name to its id within this object. */
export const twoTurnMoves: Readonly<typeof twoTurnMovesInternal> =
    twoTurnMovesInternal;

/** Types of two-turn moves. */
export type TwoTurnMove = keyof typeof twoTurnMovesInternal;

/** Number of two-turn moves that exist. */
export const numTwoTurnMoves = 9;

/** Checks if a value is a TwoTurnMove. */
export function isTwoTurnMove(value: any): value is TwoTurnMove
{
    return twoTurnMovesInternal.hasOwnProperty(value);
}

const futureMovesInternal =
{
    doomdesire: 0,
    futuresight: 1
};

/** Set of all future moves. Maps move name to its id within this object. */
export const futureMoves: Readonly<typeof futureMovesInternal> =
    futureMovesInternal;

/** Types of future moves. */
export type FutureMove = keyof typeof futureMovesInternal;

/** Number of future moves that exist. */
export const numFutureMoves = 2;

/** Checks if a value is a FutureMove. */
export function isFutureMove(value: any): value is FutureMove
{
    return futureMovesInternal.hasOwnProperty(value);
}

const items: {readonly [name: string]: number} =
{
    adamantorb: 0,
    bigroot: 1,
    choiceband: 2,
    choicescarf: 3,
    choicespecs: 4,
    chopleberry: 5,
    custapberry: 6,
    deepseascale: 7,
    deepseatooth: 8,
    focussash: 9,
    griseousorb: 10,
    ironball: 11,
    jabocaberry: 12,
    kingsrock: 13,
    lifeorb: 14,
    lightball: 15,
    luckypunch: 16,
    lustrousorb: 17,
    mentalherb: 18,
    metronome: 19,
    razorfang: 20,
    rowapberry: 21,
    stick: 22,
    thickclub: 23,
    aguavberry: 24,
    apicotberry: 25,
    aspearberry: 26,
    babiriberry: 27,
    belueberry: 28,
    blukberry: 29,
    chartiberry: 30,
    cheriberry: 31,
    chestoberry: 32,
    chilanberry: 33,
    cobaberry: 34,
    colburberry: 35,
    cornnberry: 36,
    durinberry: 37,
    enigmaberry: 38,
    figyberry: 39,
    ganlonberry: 40,
    grepaberry: 41,
    habanberry: 42,
    hondewberry: 43,
    iapapaberry: 44,
    kasibberry: 45,
    kebiaberry: 46,
    kelpsyberry: 47,
    lansatberry: 48,
    leppaberry: 49,
    liechiberry: 50,
    lumberry: 51,
    mail: 52,
    magoberry: 53,
    magostberry: 54,
    micleberry: 55,
    nanabberry: 56,
    nomelberry: 57,
    occaberry: 58,
    oranberry: 59,
    pamtreberry: 60,
    passhoberry: 61,
    payapaberry: 62,
    pechaberry: 63,
    persimberry: 64,
    petayaberry: 65,
    pinapberry: 66,
    pomegberry: 67,
    qualotberry: 68,
    rabutaberry: 69,
    rawstberry: 70,
    razzberry: 71,
    rindoberry: 72,
    salacberry: 73,
    shucaberry: 74,
    sitrusberry: 75,
    souldew: 76,
    spelonberry: 77,
    starfberry: 78,
    tamatoberry: 79,
    tangaberry: 80,
    wacanberry: 81,
    watmelberry: 82,
    wepearberry: 83,
    wikiberry: 84,
    yacheberry: 85,
    lightclay: 86,
    machobrace: 87,
    armorfossil: 88,
    berryjuice: 89,
    blackbelt: 90,
    blacksludge: 91,
    blackglasses: 92,
    brightpowder: 93,
    charcoal: 94,
    cherishball: 95,
    clawfossil: 96,
    damprock: 97,
    dawnstone: 98,
    destinyknot: 99,
    diveball: 100,
    domefossil: 101,
    dracoplate: 102,
    dragonfang: 103,
    dragonscale: 104,
    dreadplate: 105,
    dubiousdisc: 106,
    duskball: 107,
    duskstone: 108,
    earthplate: 109,
    electirizer: 110,
    energypowder: 111,
    expertbelt: 112,
    fastball: 113,
    firestone: 114,
    fistplate: 115,
    flameorb: 116,
    flameplate: 117,
    focusband: 118,
    friendball: 119,
    fullincense: 120,
    greatball: 121,
    gripclaw: 122,
    hardstone: 123,
    healball: 124,
    heatrock: 125,
    heavyball: 126,
    helixfossil: 127,
    icicleplate: 128,
    icyrock: 129,
    insectplate: 130,
    ironplate: 131,
    laggingtail: 132,
    laxincense: 133,
    leafstone: 134,
    leftovers: 135,
    levelball: 136,
    loveball: 137,
    lureball: 138,
    luxuryball: 139,
    magmarizer: 140,
    magnet: 141,
    masterball: 142,
    meadowplate: 143,
    metalcoat: 144,
    metalpowder: 145,
    mindplate: 146,
    miracleseed: 147,
    moonball: 148,
    moonstone: 149,
    muscleband: 150,
    mysticwater: 151,
    nestball: 152,
    netball: 153,
    nevermeltice: 154,
    oddincense: 155,
    oldamber: 156,
    ovalstone: 157,
    parkball: 158,
    poisonbarb: 159,
    pokeball: 160,
    poweranklet: 161,
    powerband: 162,
    powerbelt: 163,
    powerbracer: 164,
    powerherb: 165,
    powerlens: 166,
    powerweight: 167,
    premierball: 168,
    protector: 169,
    quickball: 170,
    quickclaw: 171,
    quickpowder: 172,
    rarebone: 173,
    razorclaw: 174,
    reapercloth: 175,
    repeatball: 176,
    rockincense: 177,
    rootfossil: 178,
    roseincense: 179,
    safariball: 180,
    scopelens: 181,
    seaincense: 182,
    sharpbeak: 183,
    shedshell: 184,
    shellbell: 185,
    shinystone: 186,
    silkscarf: 187,
    silverpowder: 188,
    skullfossil: 189,
    skyplate: 190,
    smoothrock: 191,
    softsand: 192,
    spelltag: 193,
    splashplate: 194,
    spookyplate: 195,
    sportball: 196,
    stickybarb: 197,
    stoneplate: 198,
    sunstone: 199,
    thunderstone: 200,
    timerball: 201,
    toxicorb: 202,
    toxicplate: 203,
    twistedspoon: 204,
    ultraball: 205,
    upgrade: 206,
    waterstone: 207,
    waveincense: 208,
    whiteherb: 209,
    widelens: 210,
    wiseglasses: 211,
    zapplate: 212,
    zoomlens: 213
};

/** Contains all relevant Pokemon-related data. */
export const dex: Dex =
{
    pokemon, numPokemon: 526, abilities, numAbilities: 123, moves,
    numMoves: 467, items, numItems: 214
};
