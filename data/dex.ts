import { Dex, PokemonData } from "./dex-types";

/** Contains data for every pokemon in the supported generation. */
const pokemon: {readonly [species: string]: PokemonData} =
{
    rotomheat:
    {
        id: 479,
        uid: 1,
        species: "Rotom-Heat",
        baseSpecies: "Rotom",
        form: "Heat",
        formLetter: "H",
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    rotomwash:
    {
        id: 479,
        uid: 2,
        species: "Rotom-Wash",
        baseSpecies: "Rotom",
        form: "Wash",
        formLetter: "W",
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    rotomfrost:
    {
        id: 479,
        uid: 3,
        species: "Rotom-Frost",
        baseSpecies: "Rotom",
        form: "Frost",
        formLetter: "F",
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    rotomfan:
    {
        id: 479,
        uid: 4,
        species: "Rotom-Fan",
        baseSpecies: "Rotom",
        form: "Fan",
        formLetter: "S",
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    rotommow:
    {
        id: 479,
        uid: 5,
        species: "Rotom-Mow",
        baseSpecies: "Rotom",
        form: "Mow",
        formLetter: "C",
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86},
        weightkg: 0.3
    },
    butterfree:
    {
        id: 12,
        uid: 6,
        species: "Butterfree",
        abilities: {compoundeyes: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 60, atk: 45, def: 50, spa: 80, spd: 80, spe: 70},
        weightkg: 32
    },
    beedrill:
    {
        id: 15,
        uid: 7,
        species: "Beedrill",
        abilities: {swarm: 1},
        types: ["bug", "poison"],
        baseStats: {hp: 65, atk: 80, def: 40, spa: 45, spd: 80, spe: 75},
        weightkg: 29.5
    },
    pidgeot:
    {
        id: 18,
        uid: 8,
        species: "Pidgeot",
        abilities: {keeneye: 1, tangledfeet: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 83, atk: 80, def: 75, spa: 70, spd: 70, spe: 91},
        weightkg: 39.5
    },
    pikachu:
    {
        id: 25,
        uid: 9,
        species: "Pikachu",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 35, atk: 55, def: 30, spa: 50, spd: 40, spe: 90},
        weightkg: 6
    },
    raichu:
    {
        id: 26,
        uid: 10,
        species: "Raichu",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 60, atk: 90, def: 55, spa: 90, spd: 80, spe: 100},
        weightkg: 30
    },
    nidoqueen:
    {
        id: 31,
        uid: 11,
        species: "Nidoqueen",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison", "ground"],
        baseStats: {hp: 90, atk: 82, def: 87, spa: 75, spd: 85, spe: 76},
        weightkg: 60
    },
    nidoking:
    {
        id: 34,
        uid: 12,
        species: "Nidoking",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison", "ground"],
        baseStats: {hp: 81, atk: 92, def: 77, spa: 85, spd: 75, spe: 85},
        weightkg: 62
    },
    clefairy:
    {
        id: 35,
        uid: 13,
        species: "Clefairy",
        abilities: {cutecharm: 1, magicguard: 2},
        types: ["normal"],
        baseStats: {hp: 70, atk: 45, def: 48, spa: 60, spd: 65, spe: 35},
        weightkg: 7.5
    },
    clefable:
    {
        id: 36,
        uid: 14,
        species: "Clefable",
        abilities: {cutecharm: 1, magicguard: 2},
        types: ["normal"],
        baseStats: {hp: 95, atk: 70, def: 73, spa: 85, spd: 90, spe: 60},
        weightkg: 40
    },
    jigglypuff:
    {
        id: 39,
        uid: 15,
        species: "Jigglypuff",
        abilities: {cutecharm: 1},
        types: ["normal"],
        baseStats: {hp: 115, atk: 45, def: 20, spa: 45, spd: 25, spe: 20},
        weightkg: 5.5
    },
    wigglytuff:
    {
        id: 40,
        uid: 16,
        species: "Wigglytuff",
        abilities: {cutecharm: 1},
        types: ["normal"],
        baseStats: {hp: 140, atk: 70, def: 45, spa: 75, spd: 50, spe: 45},
        weightkg: 12
    },
    vileplume:
    {
        id: 45,
        uid: 17,
        species: "Vileplume",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 75, atk: 80, def: 85, spa: 100, spd: 90, spe: 50},
        weightkg: 18.6
    },
    poliwrath:
    {
        id: 62,
        uid: 18,
        species: "Poliwrath",
        abilities: {waterabsorb: 1, damp: 2},
        types: ["water", "fighting"],
        baseStats: {hp: 90, atk: 85, def: 95, spa: 70, spd: 90, spe: 70},
        weightkg: 54
    },
    alakazam:
    {
        id: 65,
        uid: 19,
        species: "Alakazam",
        abilities: {synchronize: 1, innerfocus: 2},
        types: ["psychic"],
        baseStats: {hp: 55, atk: 50, def: 45, spa: 135, spd: 85, spe: 120},
        weightkg: 48
    },
    victreebel:
    {
        id: 71,
        uid: 20,
        species: "Victreebel",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 80, atk: 105, def: 65, spa: 100, spd: 60, spe: 70},
        weightkg: 15.5
    },
    golem:
    {
        id: 76,
        uid: 21,
        species: "Golem",
        abilities: {rockhead: 1, sturdy: 2},
        types: ["rock", "ground"],
        baseStats: {hp: 80, atk: 110, def: 130, spa: 55, spd: 65, spe: 45},
        weightkg: 300
    },
    mrmime:
    {
        id: 122,
        uid: 22,
        species: "Mr. Mime",
        abilities: {soundproof: 1, filter: 2},
        types: ["psychic"],
        baseStats: {hp: 40, atk: 45, def: 65, spa: 100, spd: 120, spe: 90},
        weightkg: 54.5
    },
    articuno:
    {
        id: 144,
        uid: 23,
        species: "Articuno",
        abilities: {pressure: 1},
        types: ["ice", "flying"],
        baseStats: {hp: 90, atk: 85, def: 100, spa: 95, spd: 125, spe: 85},
        weightkg: 55.4
    },
    zapdos:
    {
        id: 145,
        uid: 24,
        species: "Zapdos",
        abilities: {pressure: 1},
        types: ["electric", "flying"],
        baseStats: {hp: 90, atk: 90, def: 85, spa: 125, spd: 90, spe: 100},
        weightkg: 52.6
    },
    moltres:
    {
        id: 146,
        uid: 25,
        species: "Moltres",
        abilities: {pressure: 1},
        types: ["fire", "flying"],
        baseStats: {hp: 90, atk: 100, def: 90, spa: 125, spd: 85, spe: 90},
        weightkg: 60
    },
    chikorita:
    {
        id: 152,
        uid: 26,
        species: "Chikorita",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 45, atk: 49, def: 65, spa: 49, spd: 65, spe: 45},
        weightkg: 6.4
    },
    bayleef:
    {
        id: 153,
        uid: 27,
        species: "Bayleef",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 60, atk: 62, def: 80, spa: 63, spd: 80, spe: 60},
        weightkg: 15.8
    },
    meganium:
    {
        id: 154,
        uid: 28,
        species: "Meganium",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 80, atk: 82, def: 100, spa: 83, spd: 100, spe: 80},
        weightkg: 100.5
    },
    cyndaquil:
    {
        id: 155,
        uid: 29,
        species: "Cyndaquil",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65},
        weightkg: 7.9
    },
    quilava:
    {
        id: 156,
        uid: 30,
        species: "Quilava",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80},
        weightkg: 19
    },
    typhlosion:
    {
        id: 157,
        uid: 31,
        species: "Typhlosion",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100},
        weightkg: 79.5
    },
    totodile:
    {
        id: 158,
        uid: 32,
        species: "Totodile",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 50, atk: 65, def: 64, spa: 44, spd: 48, spe: 43},
        weightkg: 9.5
    },
    croconaw:
    {
        id: 159,
        uid: 33,
        species: "Croconaw",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 65, atk: 80, def: 80, spa: 59, spd: 63, spe: 58},
        weightkg: 25
    },
    feraligatr:
    {
        id: 160,
        uid: 34,
        species: "Feraligatr",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 85, atk: 105, def: 100, spa: 79, spd: 83, spe: 78},
        weightkg: 88.8
    },
    igglybuff:
    {
        id: 174,
        uid: 35,
        species: "Igglybuff",
        abilities: {cutecharm: 1},
        types: ["normal"],
        baseStats: {hp: 90, atk: 30, def: 15, spa: 40, spd: 20, spe: 15},
        weightkg: 1
    },
    togepi:
    {
        id: 175,
        uid: 36,
        species: "Togepi",
        abilities: {hustle: 1, serenegrace: 2},
        types: ["normal"],
        baseStats: {hp: 35, atk: 20, def: 65, spa: 40, spd: 65, spe: 20},
        weightkg: 1.5
    },
    togetic:
    {
        id: 176,
        uid: 37,
        species: "Togetic",
        abilities: {hustle: 1, serenegrace: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 55, atk: 40, def: 85, spa: 80, spd: 105, spe: 40},
        weightkg: 3.2
    },
    cleffa:
    {
        id: 173,
        uid: 38,
        species: "Cleffa",
        abilities: {cutecharm: 1, magicguard: 2},
        types: ["normal"],
        baseStats: {hp: 50, atk: 25, def: 28, spa: 45, spd: 55, spe: 15},
        weightkg: 3
    },
    ampharos:
    {
        id: 181,
        uid: 39,
        species: "Ampharos",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 90, atk: 75, def: 75, spa: 115, spd: 90, spe: 55},
        weightkg: 61.5
    },
    bellossom:
    {
        id: 182,
        uid: 40,
        species: "Bellossom",
        abilities: {chlorophyll: 1},
        types: ["grass"],
        baseStats: {hp: 75, atk: 80, def: 85, spa: 90, spd: 100, spe: 50},
        weightkg: 5.8
    },
    marill:
    {
        id: 183,
        uid: 41,
        species: "Marill",
        abilities: {thickfat: 1, hugepower: 2},
        types: ["water"],
        baseStats: {hp: 70, atk: 20, def: 50, spa: 20, spd: 50, spe: 40},
        weightkg: 8.5
    },
    azumarill:
    {
        id: 184,
        uid: 42,
        species: "Azumarill",
        abilities: {thickfat: 1, hugepower: 2},
        types: ["water"],
        baseStats: {hp: 100, atk: 50, def: 80, spa: 50, spd: 80, spe: 50},
        weightkg: 28.5
    },
    jumpluff:
    {
        id: 189,
        uid: 43,
        species: "Jumpluff",
        abilities: {chlorophyll: 1, leafguard: 2},
        types: ["grass", "flying"],
        baseStats: {hp: 75, atk: 55, def: 70, spa: 55, spd: 85, spe: 110},
        weightkg: 3
    },
    snubbull:
    {
        id: 209,
        uid: 44,
        species: "Snubbull",
        abilities: {intimidate: 1, runaway: 2},
        types: ["normal"],
        baseStats: {hp: 60, atk: 80, def: 50, spa: 40, spd: 40, spe: 30},
        weightkg: 7.8
    },
    granbull:
    {
        id: 210,
        uid: 45,
        species: "Granbull",
        abilities: {intimidate: 1, quickfeet: 2},
        types: ["normal"],
        baseStats: {hp: 90, atk: 120, def: 75, spa: 60, spd: 60, spe: 45},
        weightkg: 48.7
    },
    raikou:
    {
        id: 243,
        uid: 46,
        species: "Raikou",
        abilities: {pressure: 1},
        types: ["electric"],
        baseStats: {hp: 90, atk: 85, def: 75, spa: 115, spd: 100, spe: 115},
        weightkg: 178
    },
    entei:
    {
        id: 244,
        uid: 47,
        species: "Entei",
        abilities: {pressure: 1},
        types: ["fire"],
        baseStats: {hp: 115, atk: 115, def: 85, spa: 90, spd: 75, spe: 100},
        weightkg: 198
    },
    suicune:
    {
        id: 245,
        uid: 48,
        species: "Suicune",
        abilities: {pressure: 1},
        types: ["water"],
        baseStats: {hp: 100, atk: 75, def: 115, spa: 90, spd: 115, spe: 85},
        weightkg: 187
    },
    beautifly:
    {
        id: 267,
        uid: 49,
        species: "Beautifly",
        abilities: {swarm: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 60, atk: 70, def: 50, spa: 90, spd: 50, spe: 65},
        weightkg: 28.4
    },
    ralts:
    {
        id: 280,
        uid: 50,
        species: "Ralts",
        abilities: {synchronize: 1, trace: 2},
        types: ["psychic"],
        baseStats: {hp: 28, atk: 25, def: 25, spa: 45, spd: 35, spe: 40},
        weightkg: 6.6
    },
    kirlia:
    {
        id: 281,
        uid: 51,
        species: "Kirlia",
        abilities: {synchronize: 1, trace: 2},
        types: ["psychic"],
        baseStats: {hp: 38, atk: 35, def: 35, spa: 65, spd: 55, spe: 50},
        weightkg: 20.2
    },
    gardevoir:
    {
        id: 282,
        uid: 52,
        species: "Gardevoir",
        abilities: {synchronize: 1, trace: 2},
        types: ["psychic"],
        baseStats: {hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80},
        weightkg: 48.4
    },
    exploud:
    {
        id: 295,
        uid: 53,
        species: "Exploud",
        abilities: {soundproof: 1},
        types: ["normal"],
        baseStats: {hp: 104, atk: 91, def: 63, spa: 91, spd: 63, spe: 68},
        weightkg: 84
    },
    azurill:
    {
        id: 298,
        uid: 54,
        species: "Azurill",
        abilities: {thickfat: 1, hugepower: 2},
        types: ["normal"],
        baseStats: {hp: 50, atk: 20, def: 40, spa: 20, spd: 40, spe: 20},
        weightkg: 2
    },
    mawile:
    {
        id: 303,
        uid: 55,
        species: "Mawile",
        abilities: {hypercutter: 1, intimidate: 2},
        types: ["steel"],
        baseStats: {hp: 50, atk: 85, def: 85, spa: 55, spd: 55, spe: 50},
        weightkg: 11.5
    },
    plusle:
    {
        id: 311,
        uid: 56,
        species: "Plusle",
        abilities: {plus: 1},
        types: ["electric"],
        baseStats: {hp: 60, atk: 50, def: 40, spa: 85, spd: 75, spe: 95},
        weightkg: 4.2
    },
    minun:
    {
        id: 312,
        uid: 57,
        species: "Minun",
        abilities: {minus: 1},
        types: ["electric"],
        baseStats: {hp: 60, atk: 40, def: 50, spa: 75, spd: 85, spe: 95},
        weightkg: 4.2
    },
    kecleon:
    {
        id: 352,
        uid: 58,
        species: "Kecleon",
        abilities: {colorchange: 1},
        types: ["normal"],
        baseStats: {hp: 60, atk: 90, def: 70, spa: 60, spd: 120, spe: 40},
        weightkg: 22
    },
    milotic:
    {
        id: 350,
        uid: 59,
        species: "Milotic",
        abilities: {marvelscale: 1},
        types: ["water"],
        baseStats: {hp: 95, atk: 60, def: 79, spa: 100, spd: 125, spe: 81},
        weightkg: 162
    },
    duskull:
    {
        id: 355,
        uid: 60,
        species: "Duskull",
        abilities: {levitate: 1},
        types: ["ghost"],
        baseStats: {hp: 20, atk: 40, def: 90, spa: 30, spd: 90, spe: 25},
        weightkg: 15
    },
    dusclops:
    {
        id: 356,
        uid: 61,
        species: "Dusclops",
        abilities: {pressure: 1},
        types: ["ghost"],
        baseStats: {hp: 40, atk: 70, def: 130, spa: 60, spd: 130, spe: 25},
        weightkg: 30.6
    },
    regirock:
    {
        id: 377,
        uid: 62,
        species: "Regirock",
        abilities: {clearbody: 1},
        types: ["rock"],
        baseStats: {hp: 80, atk: 100, def: 200, spa: 50, spd: 100, spe: 50},
        weightkg: 230
    },
    regice:
    {
        id: 378,
        uid: 63,
        species: "Regice",
        abilities: {clearbody: 1},
        types: ["ice"],
        baseStats: {hp: 80, atk: 50, def: 100, spa: 100, spd: 200, spe: 50},
        weightkg: 175
    },
    registeel:
    {
        id: 379,
        uid: 64,
        species: "Registeel",
        abilities: {clearbody: 1},
        types: ["steel"],
        baseStats: {hp: 80, atk: 75, def: 150, spa: 75, spd: 150, spe: 50},
        weightkg: 205
    },
    starly:
    {
        id: 396,
        uid: 65,
        species: "Starly",
        abilities: {keeneye: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 60},
        weightkg: 2
    },
    staraptor:
    {
        id: 398,
        uid: 66,
        species: "Staraptor",
        abilities: {intimidate: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 85, atk: 120, def: 70, spa: 50, spd: 50, spe: 100},
        weightkg: 24.9
    },
    roserade:
    {
        id: 407,
        uid: 67,
        species: "Roserade",
        abilities: {naturalcure: 1, poisonpoint: 2},
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 70, def: 55, spa: 125, spd: 105, spe: 90},
        weightkg: 14.5
    },
    mimejr:
    {
        id: 439,
        uid: 68,
        species: "Mime Jr.",
        abilities: {soundproof: 1, filter: 2},
        types: ["psychic"],
        baseStats: {hp: 20, atk: 25, def: 45, spa: 70, spd: 90, spe: 60},
        weightkg: 13
    },
    togekiss:
    {
        id: 468,
        uid: 69,
        species: "Togekiss",
        abilities: {hustle: 1, serenegrace: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 85, atk: 50, def: 95, spa: 120, spd: 115, spe: 80},
        weightkg: 38
    },
    dusknoir:
    {
        id: 477,
        uid: 70,
        species: "Dusknoir",
        abilities: {pressure: 1},
        types: ["ghost"],
        baseStats: {hp: 45, atk: 100, def: 135, spa: 65, spd: 135, spe: 45},
        weightkg: 106.6
    },
    heatran:
    {
        id: 485,
        uid: 71,
        species: "Heatran",
        abilities: {flashfire: 1},
        types: ["fire", "steel"],
        baseStats: {hp: 91, atk: 90, def: 106, spa: 130, spd: 106, spe: 77},
        weightkg: 430
    },
    arbok:
    {
        id: 24,
        uid: 72,
        species: "Arbok",
        abilities: {intimidate: 1, shedskin: 2},
        types: ["poison"],
        baseStats: {hp: 60, atk: 85, def: 69, spa: 65, spd: 79, spe: 80},
        weightkg: 65
    },
    dugtrio:
    {
        id: 51,
        uid: 73,
        species: "Dugtrio",
        abilities: {sandveil: 1, arenatrap: 2},
        types: ["ground"],
        baseStats: {hp: 35, atk: 80, def: 50, spa: 50, spd: 70, spe: 120},
        weightkg: 33.3
    },
    farfetchd:
    {
        id: 83,
        uid: 74,
        species: "Farfetch'd",
        abilities: {keeneye: 1, innerfocus: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 52, atk: 65, def: 55, spa: 58, spd: 62, spe: 60},
        weightkg: 15
    },
    dodrio:
    {
        id: 85,
        uid: 75,
        species: "Dodrio",
        abilities: {runaway: 1, earlybird: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 110, def: 70, spa: 60, spd: 60, spe: 100},
        weightkg: 85.2
    },
    gengar:
    {
        id: 94,
        uid: 76,
        species: "Gengar",
        abilities: {levitate: 1},
        types: ["ghost", "poison"],
        baseStats: {hp: 60, atk: 65, def: 60, spa: 130, spd: 75, spe: 110},
        weightkg: 40.5
    },
    electrode:
    {
        id: 101,
        uid: 77,
        species: "Electrode",
        abilities: {soundproof: 1, static: 2},
        types: ["electric"],
        baseStats: {hp: 60, atk: 50, def: 70, spa: 80, spd: 80, spe: 140},
        weightkg: 66.6
    },
    exeggutor:
    {
        id: 103,
        uid: 78,
        species: "Exeggutor",
        abilities: {chlorophyll: 1},
        types: ["grass", "psychic"],
        baseStats: {hp: 95, atk: 95, def: 85, spa: 125, spd: 65, spe: 55},
        weightkg: 120
    },
    noctowl:
    {
        id: 164,
        uid: 79,
        species: "Noctowl",
        abilities: {insomnia: 1, keeneye: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 100, atk: 50, def: 50, spa: 76, spd: 96, spe: 70},
        weightkg: 40.8
    },
    ariados:
    {
        id: 168,
        uid: 80,
        species: "Ariados",
        abilities: {swarm: 1, insomnia: 2},
        types: ["bug", "poison"],
        baseStats: {hp: 70, atk: 90, def: 70, spa: 60, spd: 60, spe: 40},
        weightkg: 33.5
    },
    qwilfish:
    {
        id: 211,
        uid: 81,
        species: "Qwilfish",
        abilities: {poisonpoint: 1, swiftswim: 2},
        types: ["water", "poison"],
        baseStats: {hp: 65, atk: 95, def: 75, spa: 55, spd: 55, spe: 85},
        weightkg: 3.9
    },
    magcargo:
    {
        id: 219,
        uid: 82,
        species: "Magcargo",
        abilities: {magmaarmor: 1, flamebody: 2},
        types: ["fire", "rock"],
        baseStats: {hp: 50, atk: 50, def: 120, spa: 80, spd: 80, spe: 30},
        weightkg: 55
    },
    corsola:
    {
        id: 222,
        uid: 83,
        species: "Corsola",
        abilities: {hustle: 1, naturalcure: 2},
        types: ["water", "rock"],
        baseStats: {hp: 55, atk: 55, def: 85, spa: 65, spd: 85, spe: 35},
        weightkg: 5
    },
    mantine:
    {
        id: 226,
        uid: 84,
        species: "Mantine",
        abilities: {swiftswim: 1, waterabsorb: 2},
        types: ["water", "flying"],
        baseStats: {hp: 65, atk: 40, def: 70, spa: 80, spd: 140, spe: 70},
        weightkg: 220
    },
    swellow:
    {
        id: 277,
        uid: 85,
        species: "Swellow",
        abilities: {guts: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 85, def: 60, spa: 50, spd: 50, spe: 125},
        weightkg: 19.8
    },
    wingull:
    {
        id: 278,
        uid: 86,
        species: "Wingull",
        abilities: {keeneye: 1},
        types: ["water", "flying"],
        baseStats: {hp: 40, atk: 30, def: 30, spa: 55, spd: 30, spe: 85},
        weightkg: 9.5
    },
    pelipper:
    {
        id: 279,
        uid: 87,
        species: "Pelipper",
        abilities: {keeneye: 1},
        types: ["water", "flying"],
        baseStats: {hp: 60, atk: 50, def: 100, spa: 85, spd: 70, spe: 65},
        weightkg: 28
    },
    masquerain:
    {
        id: 284,
        uid: 88,
        species: "Masquerain",
        abilities: {intimidate: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 60, def: 62, spa: 80, spd: 82, spe: 60},
        weightkg: 3.6
    },
    delcatty:
    {
        id: 301,
        uid: 89,
        species: "Delcatty",
        abilities: {cutecharm: 1, normalize: 2},
        types: ["normal"],
        baseStats: {hp: 70, atk: 65, def: 65, spa: 55, spd: 55, spe: 70},
        weightkg: 32.6
    },
    volbeat:
    {
        id: 313,
        uid: 90,
        species: "Volbeat",
        abilities: {illuminate: 1, swarm: 2},
        types: ["bug"],
        baseStats: {hp: 65, atk: 73, def: 55, spa: 47, spd: 75, spe: 85},
        weightkg: 17.7
    },
    illumise:
    {
        id: 314,
        uid: 91,
        species: "Illumise",
        abilities: {oblivious: 1, tintedlens: 2},
        types: ["bug"],
        baseStats: {hp: 65, atk: 47, def: 55, spa: 73, spd: 75, spe: 85},
        weightkg: 17.7
    },
    torkoal:
    {
        id: 324,
        uid: 92,
        species: "Torkoal",
        abilities: {whitesmoke: 1},
        types: ["fire"],
        baseStats: {hp: 70, atk: 85, def: 140, spa: 85, spd: 70, spe: 20},
        weightkg: 80.4
    },
    lunatone:
    {
        id: 337,
        uid: 93,
        species: "Lunatone",
        abilities: {levitate: 1},
        types: ["rock", "psychic"],
        baseStats: {hp: 70, atk: 55, def: 65, spa: 95, spd: 85, spe: 70},
        weightkg: 168
    },
    solrock:
    {
        id: 338,
        uid: 94,
        species: "Solrock",
        abilities: {levitate: 1},
        types: ["rock", "psychic"],
        baseStats: {hp: 70, atk: 95, def: 85, spa: 55, spd: 65, spe: 70},
        weightkg: 154
    },
    castform:
    {
        id: 351,
        uid: 95,
        species: "Castform",
        otherForms: ["castformsunny", "castformrainy", "castformsnowy"],
        abilities: {forecast: 1},
        types: ["normal"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    castformsunny:
    {
        id: 351,
        uid: 96,
        species: "Castform-Sunny",
        baseSpecies: "Castform",
        form: "Sunny",
        formLetter: "S",
        abilities: {forecast: 1},
        types: ["fire"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    castformrainy:
    {
        id: 351,
        uid: 97,
        species: "Castform-Rainy",
        baseSpecies: "Castform",
        form: "Rainy",
        formLetter: "R",
        abilities: {forecast: 1},
        types: ["water"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    chimecho:
    {
        id: 358,
        uid: 98,
        species: "Chimecho",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 65, atk: 50, def: 70, spa: 95, spd: 80, spe: 65},
        weightkg: 1
    },
    burmy:
    {
        id: 412,
        uid: 99,
        species: "Burmy",
        baseForm: "Plant",
        abilities: {shedskin: 1},
        types: ["bug"],
        baseStats: {hp: 40, atk: 29, def: 45, spa: 29, spd: 45, spe: 36},
        weightkg: 3.4
    },
    wormadam:
    {
        id: 413,
        uid: 100,
        species: "Wormadam",
        baseForm: "Plant",
        otherForms: ["wormadamsandy", "wormadamtrash"],
        abilities: {anticipation: 1},
        types: ["bug", "grass"],
        baseStats: {hp: 60, atk: 59, def: 85, spa: 79, spd: 105, spe: 36},
        weightkg: 6.5
    },
    wormadamsandy:
    {
        id: 413,
        uid: 101,
        species: "Wormadam-Sandy",
        baseSpecies: "Wormadam",
        form: "Sandy",
        formLetter: "G",
        abilities: {anticipation: 1},
        types: ["bug", "ground"],
        baseStats: {hp: 60, atk: 79, def: 105, spa: 59, spd: 85, spe: 36},
        weightkg: 6.5
    },
    wormadamtrash:
    {
        id: 413,
        uid: 102,
        species: "Wormadam-Trash",
        baseSpecies: "Wormadam",
        form: "Trash",
        formLetter: "S",
        abilities: {anticipation: 1},
        types: ["bug", "steel"],
        baseStats: {hp: 60, atk: 69, def: 95, spa: 69, spd: 95, spe: 36},
        weightkg: 6.5
    },
    cherrim:
    {
        id: 421,
        uid: 103,
        species: "Cherrim",
        baseForm: "Overcast",
        otherForms: ["cherrimsunshine"],
        abilities: {flowergift: 1},
        types: ["grass"],
        baseStats: {hp: 70, atk: 60, def: 70, spa: 87, spd: 78, spe: 85},
        weightkg: 9.3
    },
    arceus:
    {
        id: 493,
        uid: 104,
        species: "Arceus",
        baseForm: "Normal",
        otherForms:
        [
            "arceusbug", "arceusdark", "arceusdragon", "arceuselectric",
            "arceusfighting", "arceusfire", "arceusflying", "arceusghost",
            "arceusgrass", "arceusground", "arceusice", "arceuspoison",
            "arceuspsychic", "arceusrock", "arceussteel", "arceuswater"
        ],
        abilities: {multitype: 1},
        types: ["normal"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    bulbasaur:
    {
        id: 1,
        uid: 105,
        species: "Bulbasaur",
        abilities: {overgrow: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45},
        weightkg: 6.9
    },
    ivysaur:
    {
        id: 2,
        uid: 106,
        species: "Ivysaur",
        abilities: {overgrow: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 62, def: 63, spa: 80, spd: 80, spe: 60},
        weightkg: 13
    },
    venusaur:
    {
        id: 3,
        uid: 107,
        species: "Venusaur",
        abilities: {overgrow: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80},
        weightkg: 100
    },
    charmander:
    {
        id: 4,
        uid: 108,
        species: "Charmander",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65},
        weightkg: 8.5
    },
    charmeleon:
    {
        id: 5,
        uid: 109,
        species: "Charmeleon",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 58, atk: 64, def: 58, spa: 80, spd: 65, spe: 80},
        weightkg: 19
    },
    charizard:
    {
        id: 6,
        uid: 110,
        species: "Charizard",
        abilities: {blaze: 1},
        types: ["fire", "flying"],
        baseStats: {hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100},
        weightkg: 90.5
    },
    squirtle:
    {
        id: 7,
        uid: 111,
        species: "Squirtle",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43},
        weightkg: 9
    },
    wartortle:
    {
        id: 8,
        uid: 112,
        species: "Wartortle",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 59, atk: 63, def: 80, spa: 65, spd: 80, spe: 58},
        weightkg: 22.5
    },
    blastoise:
    {
        id: 9,
        uid: 113,
        species: "Blastoise",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78},
        weightkg: 85.5
    },
    caterpie:
    {
        id: 10,
        uid: 114,
        species: "Caterpie",
        abilities: {shielddust: 1},
        types: ["bug"],
        baseStats: {hp: 45, atk: 30, def: 35, spa: 20, spd: 20, spe: 45},
        weightkg: 2.9
    },
    metapod:
    {
        id: 11,
        uid: 115,
        species: "Metapod",
        abilities: {shedskin: 1},
        types: ["bug"],
        baseStats: {hp: 50, atk: 20, def: 55, spa: 25, spd: 25, spe: 30},
        weightkg: 9.9
    },
    weedle:
    {
        id: 13,
        uid: 116,
        species: "Weedle",
        abilities: {shielddust: 1},
        types: ["bug", "poison"],
        baseStats: {hp: 40, atk: 35, def: 30, spa: 20, spd: 20, spe: 50},
        weightkg: 3.2
    },
    kakuna:
    {
        id: 14,
        uid: 117,
        species: "Kakuna",
        abilities: {shedskin: 1},
        types: ["bug", "poison"],
        baseStats: {hp: 45, atk: 25, def: 50, spa: 25, spd: 25, spe: 35},
        weightkg: 10
    },
    pidgey:
    {
        id: 16,
        uid: 118,
        species: "Pidgey",
        abilities: {keeneye: 1, tangledfeet: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 45, def: 40, spa: 35, spd: 35, spe: 56},
        weightkg: 1.8
    },
    pidgeotto:
    {
        id: 17,
        uid: 119,
        species: "Pidgeotto",
        abilities: {keeneye: 1, tangledfeet: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 63, atk: 60, def: 55, spa: 50, spd: 50, spe: 71},
        weightkg: 30
    },
    rattata:
    {
        id: 19,
        uid: 120,
        species: "Rattata",
        abilities: {runaway: 1, guts: 2},
        types: ["normal"],
        baseStats: {hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72},
        weightkg: 3.5
    },
    raticate:
    {
        id: 20,
        uid: 121,
        species: "Raticate",
        abilities: {runaway: 1, guts: 2},
        types: ["normal"],
        baseStats: {hp: 55, atk: 81, def: 60, spa: 50, spd: 70, spe: 97},
        weightkg: 18.5
    },
    spearow:
    {
        id: 21,
        uid: 122,
        species: "Spearow",
        abilities: {keeneye: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 60, def: 30, spa: 31, spd: 31, spe: 70},
        weightkg: 2
    },
    fearow:
    {
        id: 22,
        uid: 123,
        species: "Fearow",
        abilities: {keeneye: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 65, atk: 90, def: 65, spa: 61, spd: 61, spe: 100},
        weightkg: 38
    },
    ekans:
    {
        id: 23,
        uid: 124,
        species: "Ekans",
        abilities: {intimidate: 1, shedskin: 2},
        types: ["poison"],
        baseStats: {hp: 35, atk: 60, def: 44, spa: 40, spd: 54, spe: 55},
        weightkg: 6.9
    },
    sandshrew:
    {
        id: 27,
        uid: 125,
        species: "Sandshrew",
        abilities: {sandveil: 1},
        types: ["ground"],
        baseStats: {hp: 50, atk: 75, def: 85, spa: 20, spd: 30, spe: 40},
        weightkg: 12
    },
    sandslash:
    {
        id: 28,
        uid: 126,
        species: "Sandslash",
        abilities: {sandveil: 1},
        types: ["ground"],
        baseStats: {hp: 75, atk: 100, def: 110, spa: 45, spd: 55, spe: 65},
        weightkg: 29.5
    },
    nidoranf:
    {
        id: 29,
        uid: 127,
        species: "Nidoran-F",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison"],
        baseStats: {hp: 55, atk: 47, def: 52, spa: 40, spd: 40, spe: 41},
        weightkg: 7
    },
    nidorina:
    {
        id: 30,
        uid: 128,
        species: "Nidorina",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison"],
        baseStats: {hp: 70, atk: 62, def: 67, spa: 55, spd: 55, spe: 56},
        weightkg: 20
    },
    nidoranm:
    {
        id: 32,
        uid: 129,
        species: "Nidoran-M",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison"],
        baseStats: {hp: 46, atk: 57, def: 40, spa: 40, spd: 40, spe: 50},
        weightkg: 9
    },
    nidorino:
    {
        id: 33,
        uid: 130,
        species: "Nidorino",
        abilities: {poisonpoint: 1, rivalry: 2},
        types: ["poison"],
        baseStats: {hp: 61, atk: 72, def: 57, spa: 55, spd: 55, spe: 65},
        weightkg: 19.5
    },
    vulpix:
    {
        id: 37,
        uid: 131,
        species: "Vulpix",
        abilities: {flashfire: 1},
        types: ["fire"],
        baseStats: {hp: 38, atk: 41, def: 40, spa: 50, spd: 65, spe: 65},
        weightkg: 9.9
    },
    ninetales:
    {
        id: 38,
        uid: 132,
        species: "Ninetales",
        abilities: {flashfire: 1},
        types: ["fire"],
        baseStats: {hp: 73, atk: 76, def: 75, spa: 81, spd: 100, spe: 100},
        weightkg: 19.9
    },
    zubat:
    {
        id: 41,
        uid: 133,
        species: "Zubat",
        abilities: {innerfocus: 1},
        types: ["poison", "flying"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 30, spd: 40, spe: 55},
        weightkg: 7.5
    },
    golbat:
    {
        id: 42,
        uid: 134,
        species: "Golbat",
        abilities: {innerfocus: 1},
        types: ["poison", "flying"],
        baseStats: {hp: 75, atk: 80, def: 70, spa: 65, spd: 75, spe: 90},
        weightkg: 55
    },
    oddish:
    {
        id: 43,
        uid: 135,
        species: "Oddish",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 45, atk: 50, def: 55, spa: 75, spd: 65, spe: 30},
        weightkg: 5.4
    },
    gloom:
    {
        id: 44,
        uid: 136,
        species: "Gloom",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 60, atk: 65, def: 70, spa: 85, spd: 75, spe: 40},
        weightkg: 8.6
    },
    paras:
    {
        id: 46,
        uid: 137,
        species: "Paras",
        abilities: {effectspore: 1, dryskin: 2},
        types: ["bug", "grass"],
        baseStats: {hp: 35, atk: 70, def: 55, spa: 45, spd: 55, spe: 25},
        weightkg: 5.4
    },
    parasect:
    {
        id: 47,
        uid: 138,
        species: "Parasect",
        abilities: {effectspore: 1, dryskin: 2},
        types: ["bug", "grass"],
        baseStats: {hp: 60, atk: 95, def: 80, spa: 60, spd: 80, spe: 30},
        weightkg: 29.5
    },
    venonat:
    {
        id: 48,
        uid: 139,
        species: "Venonat",
        abilities: {compoundeyes: 1, tintedlens: 2},
        types: ["bug", "poison"],
        baseStats: {hp: 60, atk: 55, def: 50, spa: 40, spd: 55, spe: 45},
        weightkg: 30
    },
    venomoth:
    {
        id: 49,
        uid: 140,
        species: "Venomoth",
        abilities: {shielddust: 1, tintedlens: 2},
        types: ["bug", "poison"],
        baseStats: {hp: 70, atk: 65, def: 60, spa: 90, spd: 75, spe: 90},
        weightkg: 12.5
    },
    diglett:
    {
        id: 50,
        uid: 141,
        species: "Diglett",
        abilities: {sandveil: 1, arenatrap: 2},
        types: ["ground"],
        baseStats: {hp: 10, atk: 55, def: 25, spa: 35, spd: 45, spe: 95},
        weightkg: 0.8
    },
    meowth:
    {
        id: 52,
        uid: 142,
        species: "Meowth",
        abilities: {pickup: 1, technician: 2},
        types: ["normal"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 40, spd: 40, spe: 90},
        weightkg: 4.2
    },
    persian:
    {
        id: 53,
        uid: 143,
        species: "Persian",
        abilities: {limber: 1, technician: 2},
        types: ["normal"],
        baseStats: {hp: 65, atk: 70, def: 60, spa: 65, spd: 65, spe: 115},
        weightkg: 32
    },
    psyduck:
    {
        id: 54,
        uid: 144,
        species: "Psyduck",
        abilities: {damp: 1, cloudnine: 2},
        types: ["water"],
        baseStats: {hp: 50, atk: 52, def: 48, spa: 65, spd: 50, spe: 55},
        weightkg: 19.6
    },
    golduck:
    {
        id: 55,
        uid: 145,
        species: "Golduck",
        abilities: {damp: 1, cloudnine: 2},
        types: ["water"],
        baseStats: {hp: 80, atk: 82, def: 78, spa: 95, spd: 80, spe: 85},
        weightkg: 76.6
    },
    mankey:
    {
        id: 56,
        uid: 146,
        species: "Mankey",
        abilities: {vitalspirit: 1, angerpoint: 2},
        types: ["fighting"],
        baseStats: {hp: 40, atk: 80, def: 35, spa: 35, spd: 45, spe: 70},
        weightkg: 28
    },
    primeape:
    {
        id: 57,
        uid: 147,
        species: "Primeape",
        abilities: {vitalspirit: 1, angerpoint: 2},
        types: ["fighting"],
        baseStats: {hp: 65, atk: 105, def: 60, spa: 60, spd: 70, spe: 95},
        weightkg: 32
    },
    growlithe:
    {
        id: 58,
        uid: 148,
        species: "Growlithe",
        abilities: {intimidate: 1, flashfire: 2},
        types: ["fire"],
        baseStats: {hp: 55, atk: 70, def: 45, spa: 70, spd: 50, spe: 60},
        weightkg: 19
    },
    arcanine:
    {
        id: 59,
        uid: 149,
        species: "Arcanine",
        abilities: {intimidate: 1, flashfire: 2},
        types: ["fire"],
        baseStats: {hp: 90, atk: 110, def: 80, spa: 100, spd: 80, spe: 95},
        weightkg: 155
    },
    poliwag:
    {
        id: 60,
        uid: 150,
        species: "Poliwag",
        abilities: {waterabsorb: 1, damp: 2},
        types: ["water"],
        baseStats: {hp: 40, atk: 50, def: 40, spa: 40, spd: 40, spe: 90},
        weightkg: 12.4
    },
    poliwhirl:
    {
        id: 61,
        uid: 151,
        species: "Poliwhirl",
        abilities: {waterabsorb: 1, damp: 2},
        types: ["water"],
        baseStats: {hp: 65, atk: 65, def: 65, spa: 50, spd: 50, spe: 90},
        weightkg: 20
    },
    abra:
    {
        id: 63,
        uid: 152,
        species: "Abra",
        abilities: {synchronize: 1, innerfocus: 2},
        types: ["psychic"],
        baseStats: {hp: 25, atk: 20, def: 15, spa: 105, spd: 55, spe: 90},
        weightkg: 19.5
    },
    kadabra:
    {
        id: 64,
        uid: 153,
        species: "Kadabra",
        abilities: {synchronize: 1, innerfocus: 2},
        types: ["psychic"],
        baseStats: {hp: 40, atk: 35, def: 30, spa: 120, spd: 70, spe: 105},
        weightkg: 56.5
    },
    machop:
    {
        id: 66,
        uid: 154,
        species: "Machop",
        abilities: {guts: 1, noguard: 2},
        types: ["fighting"],
        baseStats: {hp: 70, atk: 80, def: 50, spa: 35, spd: 35, spe: 35},
        weightkg: 19.5
    },
    machoke:
    {
        id: 67,
        uid: 155,
        species: "Machoke",
        abilities: {guts: 1, noguard: 2},
        types: ["fighting"],
        baseStats: {hp: 80, atk: 100, def: 70, spa: 50, spd: 60, spe: 45},
        weightkg: 70.5
    },
    machamp:
    {
        id: 68,
        uid: 156,
        species: "Machamp",
        abilities: {guts: 1, noguard: 2},
        types: ["fighting"],
        baseStats: {hp: 90, atk: 130, def: 80, spa: 65, spd: 85, spe: 55},
        weightkg: 130
    },
    bellsprout:
    {
        id: 69,
        uid: 157,
        species: "Bellsprout",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 50, atk: 75, def: 35, spa: 70, spd: 30, spe: 40},
        weightkg: 4
    },
    weepinbell:
    {
        id: 70,
        uid: 158,
        species: "Weepinbell",
        abilities: {chlorophyll: 1},
        types: ["grass", "poison"],
        baseStats: {hp: 65, atk: 90, def: 50, spa: 85, spd: 45, spe: 55},
        weightkg: 6.4
    },
    tentacool:
    {
        id: 72,
        uid: 159,
        species: "Tentacool",
        abilities: {clearbody: 1, liquidooze: 2},
        types: ["water", "poison"],
        baseStats: {hp: 40, atk: 40, def: 35, spa: 50, spd: 100, spe: 70},
        weightkg: 45.5
    },
    tentacruel:
    {
        id: 73,
        uid: 160,
        species: "Tentacruel",
        abilities: {clearbody: 1, liquidooze: 2},
        types: ["water", "poison"],
        baseStats: {hp: 80, atk: 70, def: 65, spa: 80, spd: 120, spe: 100},
        weightkg: 55
    },
    geodude:
    {
        id: 74,
        uid: 161,
        species: "Geodude",
        abilities: {rockhead: 1, sturdy: 2},
        types: ["rock", "ground"],
        baseStats: {hp: 40, atk: 80, def: 100, spa: 30, spd: 30, spe: 20},
        weightkg: 20
    },
    graveler:
    {
        id: 75,
        uid: 162,
        species: "Graveler",
        abilities: {rockhead: 1, sturdy: 2},
        types: ["rock", "ground"],
        baseStats: {hp: 55, atk: 95, def: 115, spa: 45, spd: 45, spe: 35},
        weightkg: 105
    },
    ponyta:
    {
        id: 77,
        uid: 163,
        species: "Ponyta",
        abilities: {runaway: 1, flashfire: 2},
        types: ["fire"],
        baseStats: {hp: 50, atk: 85, def: 55, spa: 65, spd: 65, spe: 90},
        weightkg: 30
    },
    rapidash:
    {
        id: 78,
        uid: 164,
        species: "Rapidash",
        abilities: {runaway: 1, flashfire: 2},
        types: ["fire"],
        baseStats: {hp: 65, atk: 100, def: 70, spa: 80, spd: 80, spe: 105},
        weightkg: 95
    },
    slowpoke:
    {
        id: 79,
        uid: 165,
        species: "Slowpoke",
        abilities: {oblivious: 1, owntempo: 2},
        types: ["water", "psychic"],
        baseStats: {hp: 90, atk: 65, def: 65, spa: 40, spd: 40, spe: 15},
        weightkg: 36
    },
    slowbro:
    {
        id: 80,
        uid: 166,
        species: "Slowbro",
        abilities: {oblivious: 1, owntempo: 2},
        types: ["water", "psychic"],
        baseStats: {hp: 95, atk: 75, def: 110, spa: 100, spd: 80, spe: 30},
        weightkg: 78.5
    },
    magnemite:
    {
        id: 81,
        uid: 167,
        species: "Magnemite",
        abilities: {magnetpull: 1, sturdy: 2},
        types: ["electric", "steel"],
        baseStats: {hp: 25, atk: 35, def: 70, spa: 95, spd: 55, spe: 45},
        weightkg: 6
    },
    magneton:
    {
        id: 82,
        uid: 168,
        species: "Magneton",
        abilities: {magnetpull: 1, sturdy: 2},
        types: ["electric", "steel"],
        baseStats: {hp: 50, atk: 60, def: 95, spa: 120, spd: 70, spe: 70},
        weightkg: 60
    },
    doduo:
    {
        id: 84,
        uid: 169,
        species: "Doduo",
        abilities: {runaway: 1, earlybird: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 35, atk: 85, def: 45, spa: 35, spd: 35, spe: 75},
        weightkg: 39.2
    },
    seel:
    {
        id: 86,
        uid: 170,
        species: "Seel",
        abilities: {thickfat: 1, hydration: 2},
        types: ["water"],
        baseStats: {hp: 65, atk: 45, def: 55, spa: 45, spd: 70, spe: 45},
        weightkg: 90
    },
    dewgong:
    {
        id: 87,
        uid: 171,
        species: "Dewgong",
        abilities: {thickfat: 1, hydration: 2},
        types: ["water", "ice"],
        baseStats: {hp: 90, atk: 70, def: 80, spa: 70, spd: 95, spe: 70},
        weightkg: 120
    },
    grimer:
    {
        id: 88,
        uid: 172,
        species: "Grimer",
        abilities: {stench: 1, stickyhold: 2},
        types: ["poison"],
        baseStats: {hp: 80, atk: 80, def: 50, spa: 40, spd: 50, spe: 25},
        weightkg: 30
    },
    muk:
    {
        id: 89,
        uid: 173,
        species: "Muk",
        abilities: {stench: 1, stickyhold: 2},
        types: ["poison"],
        baseStats: {hp: 105, atk: 105, def: 75, spa: 65, spd: 100, spe: 50},
        weightkg: 30
    },
    shellder:
    {
        id: 90,
        uid: 174,
        species: "Shellder",
        abilities: {shellarmor: 1, skilllink: 2},
        types: ["water"],
        baseStats: {hp: 30, atk: 65, def: 100, spa: 45, spd: 25, spe: 40},
        weightkg: 4
    },
    cloyster:
    {
        id: 91,
        uid: 175,
        species: "Cloyster",
        abilities: {shellarmor: 1, skilllink: 2},
        types: ["water", "ice"],
        baseStats: {hp: 50, atk: 95, def: 180, spa: 85, spd: 45, spe: 70},
        weightkg: 132.5
    },
    gastly:
    {
        id: 92,
        uid: 176,
        species: "Gastly",
        abilities: {levitate: 1},
        types: ["ghost", "poison"],
        baseStats: {hp: 30, atk: 35, def: 30, spa: 100, spd: 35, spe: 80},
        weightkg: 0.1
    },
    haunter:
    {
        id: 93,
        uid: 177,
        species: "Haunter",
        abilities: {levitate: 1},
        types: ["ghost", "poison"],
        baseStats: {hp: 45, atk: 50, def: 45, spa: 115, spd: 55, spe: 95},
        weightkg: 0.1
    },
    onix:
    {
        id: 95,
        uid: 178,
        species: "Onix",
        abilities: {rockhead: 1, sturdy: 2},
        types: ["rock", "ground"],
        baseStats: {hp: 35, atk: 45, def: 160, spa: 30, spd: 45, spe: 70},
        weightkg: 210
    },
    drowzee:
    {
        id: 96,
        uid: 179,
        species: "Drowzee",
        abilities: {insomnia: 1, forewarn: 2},
        types: ["psychic"],
        baseStats: {hp: 60, atk: 48, def: 45, spa: 43, spd: 90, spe: 42},
        weightkg: 32.4
    },
    hypno:
    {
        id: 97,
        uid: 180,
        species: "Hypno",
        abilities: {insomnia: 1, forewarn: 2},
        types: ["psychic"],
        baseStats: {hp: 85, atk: 73, def: 70, spa: 73, spd: 115, spe: 67},
        weightkg: 75.6
    },
    krabby:
    {
        id: 98,
        uid: 181,
        species: "Krabby",
        abilities: {hypercutter: 1, shellarmor: 2},
        types: ["water"],
        baseStats: {hp: 30, atk: 105, def: 90, spa: 25, spd: 25, spe: 50},
        weightkg: 6.5
    },
    kingler:
    {
        id: 99,
        uid: 182,
        species: "Kingler",
        abilities: {hypercutter: 1, shellarmor: 2},
        types: ["water"],
        baseStats: {hp: 55, atk: 130, def: 115, spa: 50, spd: 50, spe: 75},
        weightkg: 60
    },
    voltorb:
    {
        id: 100,
        uid: 183,
        species: "Voltorb",
        abilities: {soundproof: 1, static: 2},
        types: ["electric"],
        baseStats: {hp: 40, atk: 30, def: 50, spa: 55, spd: 55, spe: 100},
        weightkg: 10.4
    },
    exeggcute:
    {
        id: 102,
        uid: 184,
        species: "Exeggcute",
        abilities: {chlorophyll: 1},
        types: ["grass", "psychic"],
        baseStats: {hp: 60, atk: 40, def: 80, spa: 60, spd: 45, spe: 40},
        weightkg: 2.5
    },
    cubone:
    {
        id: 104,
        uid: 185,
        species: "Cubone",
        abilities: {rockhead: 1, lightningrod: 2},
        types: ["ground"],
        baseStats: {hp: 50, atk: 50, def: 95, spa: 40, spd: 50, spe: 35},
        weightkg: 6.5
    },
    marowak:
    {
        id: 105,
        uid: 186,
        species: "Marowak",
        abilities: {rockhead: 1, lightningrod: 2},
        types: ["ground"],
        baseStats: {hp: 60, atk: 80, def: 110, spa: 50, spd: 80, spe: 45},
        weightkg: 45
    },
    hitmonlee:
    {
        id: 106,
        uid: 187,
        species: "Hitmonlee",
        abilities: {limber: 1, reckless: 2},
        types: ["fighting"],
        baseStats: {hp: 50, atk: 120, def: 53, spa: 35, spd: 110, spe: 87},
        weightkg: 49.8
    },
    hitmonchan:
    {
        id: 107,
        uid: 188,
        species: "Hitmonchan",
        abilities: {keeneye: 1, ironfist: 2},
        types: ["fighting"],
        baseStats: {hp: 50, atk: 105, def: 79, spa: 35, spd: 110, spe: 76},
        weightkg: 50.2
    },
    lickitung:
    {
        id: 108,
        uid: 189,
        species: "Lickitung",
        abilities: {owntempo: 1, oblivious: 2},
        types: ["normal"],
        baseStats: {hp: 90, atk: 55, def: 75, spa: 60, spd: 75, spe: 30},
        weightkg: 65.5
    },
    koffing:
    {
        id: 109,
        uid: 190,
        species: "Koffing",
        abilities: {levitate: 1},
        types: ["poison"],
        baseStats: {hp: 40, atk: 65, def: 95, spa: 60, spd: 45, spe: 35},
        weightkg: 1
    },
    weezing:
    {
        id: 110,
        uid: 191,
        species: "Weezing",
        abilities: {levitate: 1},
        types: ["poison"],
        baseStats: {hp: 65, atk: 90, def: 120, spa: 85, spd: 70, spe: 60},
        weightkg: 9.5
    },
    rhyhorn:
    {
        id: 111,
        uid: 192,
        species: "Rhyhorn",
        abilities: {lightningrod: 1, rockhead: 2},
        types: ["ground", "rock"],
        baseStats: {hp: 80, atk: 85, def: 95, spa: 30, spd: 30, spe: 25},
        weightkg: 115
    },
    rhydon:
    {
        id: 112,
        uid: 193,
        species: "Rhydon",
        abilities: {lightningrod: 1, rockhead: 2},
        types: ["ground", "rock"],
        baseStats: {hp: 105, atk: 130, def: 120, spa: 45, spd: 45, spe: 40},
        weightkg: 120
    },
    chansey:
    {
        id: 113,
        uid: 194,
        species: "Chansey",
        abilities: {naturalcure: 1, serenegrace: 2},
        types: ["normal"],
        baseStats: {hp: 250, atk: 5, def: 5, spa: 35, spd: 105, spe: 50},
        weightkg: 34.6
    },
    tangela:
    {
        id: 114,
        uid: 195,
        species: "Tangela",
        abilities: {chlorophyll: 1, leafguard: 2},
        types: ["grass"],
        baseStats: {hp: 65, atk: 55, def: 115, spa: 100, spd: 40, spe: 60},
        weightkg: 35
    },
    kangaskhan:
    {
        id: 115,
        uid: 196,
        species: "Kangaskhan",
        abilities: {earlybird: 1, scrappy: 2},
        types: ["normal"],
        baseStats: {hp: 105, atk: 95, def: 80, spa: 40, spd: 80, spe: 90},
        weightkg: 80
    },
    horsea:
    {
        id: 116,
        uid: 197,
        species: "Horsea",
        abilities: {swiftswim: 1, sniper: 2},
        types: ["water"],
        baseStats: {hp: 30, atk: 40, def: 70, spa: 70, spd: 25, spe: 60},
        weightkg: 8
    },
    seadra:
    {
        id: 117,
        uid: 198,
        species: "Seadra",
        abilities: {poisonpoint: 1, sniper: 2},
        types: ["water"],
        baseStats: {hp: 55, atk: 65, def: 95, spa: 95, spd: 45, spe: 85},
        weightkg: 25
    },
    goldeen:
    {
        id: 118,
        uid: 199,
        species: "Goldeen",
        abilities: {swiftswim: 1, waterveil: 2},
        types: ["water"],
        baseStats: {hp: 45, atk: 67, def: 60, spa: 35, spd: 50, spe: 63},
        weightkg: 15
    },
    seaking:
    {
        id: 119,
        uid: 200,
        species: "Seaking",
        abilities: {swiftswim: 1, waterveil: 2},
        types: ["water"],
        baseStats: {hp: 80, atk: 92, def: 65, spa: 65, spd: 80, spe: 68},
        weightkg: 39
    },
    staryu:
    {
        id: 120,
        uid: 201,
        species: "Staryu",
        abilities: {illuminate: 1, naturalcure: 2},
        types: ["water"],
        baseStats: {hp: 30, atk: 45, def: 55, spa: 70, spd: 55, spe: 85},
        weightkg: 34.5
    },
    starmie:
    {
        id: 121,
        uid: 202,
        species: "Starmie",
        abilities: {illuminate: 1, naturalcure: 2},
        types: ["water", "psychic"],
        baseStats: {hp: 60, atk: 75, def: 85, spa: 100, spd: 85, spe: 115},
        weightkg: 80
    },
    scyther:
    {
        id: 123,
        uid: 203,
        species: "Scyther",
        abilities: {swarm: 1, technician: 2},
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 110, def: 80, spa: 55, spd: 80, spe: 105},
        weightkg: 56
    },
    jynx:
    {
        id: 124,
        uid: 204,
        species: "Jynx",
        abilities: {oblivious: 1, forewarn: 2},
        types: ["ice", "psychic"],
        baseStats: {hp: 65, atk: 50, def: 35, spa: 115, spd: 95, spe: 95},
        weightkg: 40.6
    },
    electabuzz:
    {
        id: 125,
        uid: 205,
        species: "Electabuzz",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 65, atk: 83, def: 57, spa: 95, spd: 85, spe: 105},
        weightkg: 30
    },
    magmar:
    {
        id: 126,
        uid: 206,
        species: "Magmar",
        abilities: {flamebody: 1},
        types: ["fire"],
        baseStats: {hp: 65, atk: 95, def: 57, spa: 100, spd: 85, spe: 93},
        weightkg: 44.5
    },
    pinsir:
    {
        id: 127,
        uid: 207,
        species: "Pinsir",
        abilities: {hypercutter: 1, moldbreaker: 2},
        types: ["bug"],
        baseStats: {hp: 65, atk: 125, def: 100, spa: 55, spd: 70, spe: 85},
        weightkg: 55
    },
    tauros:
    {
        id: 128,
        uid: 208,
        species: "Tauros",
        abilities: {intimidate: 1, angerpoint: 2},
        types: ["normal"],
        baseStats: {hp: 75, atk: 100, def: 95, spa: 40, spd: 70, spe: 110},
        weightkg: 88.4
    },
    magikarp:
    {
        id: 129,
        uid: 209,
        species: "Magikarp",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 20, atk: 10, def: 55, spa: 15, spd: 20, spe: 80},
        weightkg: 10
    },
    gyarados:
    {
        id: 130,
        uid: 210,
        species: "Gyarados",
        abilities: {intimidate: 1},
        types: ["water", "flying"],
        baseStats: {hp: 95, atk: 125, def: 79, spa: 60, spd: 100, spe: 81},
        weightkg: 235
    },
    lapras:
    {
        id: 131,
        uid: 211,
        species: "Lapras",
        abilities: {waterabsorb: 1, shellarmor: 2},
        types: ["water", "ice"],
        baseStats: {hp: 130, atk: 85, def: 80, spa: 85, spd: 95, spe: 60},
        weightkg: 220
    },
    ditto:
    {
        id: 132,
        uid: 212,
        species: "Ditto",
        abilities: {limber: 1},
        types: ["normal"],
        baseStats: {hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48},
        weightkg: 4
    },
    eevee:
    {
        id: 133,
        uid: 213,
        species: "Eevee",
        abilities: {runaway: 1, adaptability: 2},
        types: ["normal"],
        baseStats: {hp: 55, atk: 55, def: 50, spa: 45, spd: 65, spe: 55},
        weightkg: 6.5
    },
    vaporeon:
    {
        id: 134,
        uid: 214,
        species: "Vaporeon",
        abilities: {waterabsorb: 1},
        types: ["water"],
        baseStats: {hp: 130, atk: 65, def: 60, spa: 110, spd: 95, spe: 65},
        weightkg: 29
    },
    jolteon:
    {
        id: 135,
        uid: 215,
        species: "Jolteon",
        abilities: {voltabsorb: 1},
        types: ["electric"],
        baseStats: {hp: 65, atk: 65, def: 60, spa: 110, spd: 95, spe: 130},
        weightkg: 24.5
    },
    flareon:
    {
        id: 136,
        uid: 216,
        species: "Flareon",
        abilities: {flashfire: 1},
        types: ["fire"],
        baseStats: {hp: 65, atk: 130, def: 60, spa: 95, spd: 110, spe: 65},
        weightkg: 25
    },
    porygon:
    {
        id: 137,
        uid: 217,
        species: "Porygon",
        abilities: {trace: 1, download: 2},
        types: ["normal"],
        baseStats: {hp: 65, atk: 60, def: 70, spa: 85, spd: 75, spe: 40},
        weightkg: 36.5
    },
    omanyte:
    {
        id: 138,
        uid: 218,
        species: "Omanyte",
        abilities: {swiftswim: 1, shellarmor: 2},
        types: ["rock", "water"],
        baseStats: {hp: 35, atk: 40, def: 100, spa: 90, spd: 55, spe: 35},
        weightkg: 7.5
    },
    omastar:
    {
        id: 139,
        uid: 219,
        species: "Omastar",
        abilities: {swiftswim: 1, shellarmor: 2},
        types: ["rock", "water"],
        baseStats: {hp: 70, atk: 60, def: 125, spa: 115, spd: 70, spe: 55},
        weightkg: 35
    },
    kabuto:
    {
        id: 140,
        uid: 220,
        species: "Kabuto",
        abilities: {swiftswim: 1, battlearmor: 2},
        types: ["rock", "water"],
        baseStats: {hp: 30, atk: 80, def: 90, spa: 55, spd: 45, spe: 55},
        weightkg: 11.5
    },
    kabutops:
    {
        id: 141,
        uid: 221,
        species: "Kabutops",
        abilities: {swiftswim: 1, battlearmor: 2},
        types: ["rock", "water"],
        baseStats: {hp: 60, atk: 115, def: 105, spa: 65, spd: 70, spe: 80},
        weightkg: 40.5
    },
    aerodactyl:
    {
        id: 142,
        uid: 222,
        species: "Aerodactyl",
        abilities: {rockhead: 1, pressure: 2},
        types: ["rock", "flying"],
        baseStats: {hp: 80, atk: 105, def: 65, spa: 60, spd: 75, spe: 130},
        weightkg: 59
    },
    snorlax:
    {
        id: 143,
        uid: 223,
        species: "Snorlax",
        abilities: {immunity: 1, thickfat: 2},
        types: ["normal"],
        baseStats: {hp: 160, atk: 110, def: 65, spa: 65, spd: 110, spe: 30},
        weightkg: 460
    },
    dratini:
    {
        id: 147,
        uid: 224,
        species: "Dratini",
        abilities: {shedskin: 1},
        types: ["dragon"],
        baseStats: {hp: 41, atk: 64, def: 45, spa: 50, spd: 50, spe: 50},
        weightkg: 3.3
    },
    dragonair:
    {
        id: 148,
        uid: 225,
        species: "Dragonair",
        abilities: {shedskin: 1},
        types: ["dragon"],
        baseStats: {hp: 61, atk: 84, def: 65, spa: 70, spd: 70, spe: 70},
        weightkg: 16.5
    },
    dragonite:
    {
        id: 149,
        uid: 226,
        species: "Dragonite",
        abilities: {innerfocus: 1},
        types: ["dragon", "flying"],
        baseStats: {hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80},
        weightkg: 210
    },
    mewtwo:
    {
        id: 150,
        uid: 227,
        species: "Mewtwo",
        abilities: {pressure: 1},
        types: ["psychic"],
        baseStats: {hp: 106, atk: 110, def: 90, spa: 154, spd: 90, spe: 130},
        weightkg: 122
    },
    mew:
    {
        id: 151,
        uid: 228,
        species: "Mew",
        abilities: {synchronize: 1},
        types: ["psychic"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 4
    },
    sentret:
    {
        id: 161,
        uid: 229,
        species: "Sentret",
        abilities: {runaway: 1, keeneye: 2},
        types: ["normal"],
        baseStats: {hp: 35, atk: 46, def: 34, spa: 35, spd: 45, spe: 20},
        weightkg: 6
    },
    furret:
    {
        id: 162,
        uid: 230,
        species: "Furret",
        abilities: {runaway: 1, keeneye: 2},
        types: ["normal"],
        baseStats: {hp: 85, atk: 76, def: 64, spa: 45, spd: 55, spe: 90},
        weightkg: 32.5
    },
    hoothoot:
    {
        id: 163,
        uid: 231,
        species: "Hoothoot",
        abilities: {insomnia: 1, keeneye: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 60, atk: 30, def: 30, spa: 36, spd: 56, spe: 50},
        weightkg: 21.2
    },
    ledyba:
    {
        id: 165,
        uid: 232,
        species: "Ledyba",
        abilities: {swarm: 1, earlybird: 2},
        types: ["bug", "flying"],
        baseStats: {hp: 40, atk: 20, def: 30, spa: 40, spd: 80, spe: 55},
        weightkg: 10.8
    },
    ledian:
    {
        id: 166,
        uid: 233,
        species: "Ledian",
        abilities: {swarm: 1, earlybird: 2},
        types: ["bug", "flying"],
        baseStats: {hp: 55, atk: 35, def: 50, spa: 55, spd: 110, spe: 85},
        weightkg: 35.6
    },
    spinarak:
    {
        id: 167,
        uid: 234,
        species: "Spinarak",
        abilities: {swarm: 1, insomnia: 2},
        types: ["bug", "poison"],
        baseStats: {hp: 40, atk: 60, def: 40, spa: 40, spd: 40, spe: 30},
        weightkg: 8.5
    },
    crobat:
    {
        id: 169,
        uid: 235,
        species: "Crobat",
        abilities: {innerfocus: 1},
        types: ["poison", "flying"],
        baseStats: {hp: 85, atk: 90, def: 80, spa: 70, spd: 80, spe: 130},
        weightkg: 75
    },
    chinchou:
    {
        id: 170,
        uid: 236,
        species: "Chinchou",
        abilities: {voltabsorb: 1, illuminate: 2},
        types: ["water", "electric"],
        baseStats: {hp: 75, atk: 38, def: 38, spa: 56, spd: 56, spe: 67},
        weightkg: 12
    },
    lanturn:
    {
        id: 171,
        uid: 237,
        species: "Lanturn",
        abilities: {voltabsorb: 1, illuminate: 2},
        types: ["water", "electric"],
        baseStats: {hp: 125, atk: 58, def: 58, spa: 76, spd: 76, spe: 67},
        weightkg: 22.5
    },
    pichu:
    {
        id: 172,
        uid: 238,
        species: "Pichu",
        otherForms: ["pichuspikyeared"],
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 20, atk: 40, def: 15, spa: 35, spd: 35, spe: 60},
        weightkg: 2
    },
    pichuspikyeared:
    {
        id: 172,
        uid: 239,
        species: "Pichu-Spiky-eared",
        baseSpecies: "Pichu",
        form: "Spiky-eared",
        formLetter: "S",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 20, atk: 40, def: 15, spa: 35, spd: 35, spe: 60},
        weightkg: 2
    },
    natu:
    {
        id: 177,
        uid: 240,
        species: "Natu",
        abilities: {synchronize: 1, earlybird: 2},
        types: ["psychic", "flying"],
        baseStats: {hp: 40, atk: 50, def: 45, spa: 70, spd: 45, spe: 70},
        weightkg: 2
    },
    xatu:
    {
        id: 178,
        uid: 241,
        species: "Xatu",
        abilities: {synchronize: 1, earlybird: 2},
        types: ["psychic", "flying"],
        baseStats: {hp: 65, atk: 75, def: 70, spa: 95, spd: 70, spe: 95},
        weightkg: 15
    },
    mareep:
    {
        id: 179,
        uid: 242,
        species: "Mareep",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 55, atk: 40, def: 40, spa: 65, spd: 45, spe: 35},
        weightkg: 7.8
    },
    flaaffy:
    {
        id: 180,
        uid: 243,
        species: "Flaaffy",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 70, atk: 55, def: 55, spa: 80, spd: 60, spe: 45},
        weightkg: 13.3
    },
    sudowoodo:
    {
        id: 185,
        uid: 244,
        species: "Sudowoodo",
        abilities: {sturdy: 1, rockhead: 2},
        types: ["rock"],
        baseStats: {hp: 70, atk: 100, def: 115, spa: 30, spd: 65, spe: 30},
        weightkg: 38
    },
    politoed:
    {
        id: 186,
        uid: 245,
        species: "Politoed",
        abilities: {waterabsorb: 1, damp: 2},
        types: ["water"],
        baseStats: {hp: 90, atk: 75, def: 75, spa: 90, spd: 100, spe: 70},
        weightkg: 33.9
    },
    hoppip:
    {
        id: 187,
        uid: 246,
        species: "Hoppip",
        abilities: {chlorophyll: 1, leafguard: 2},
        types: ["grass", "flying"],
        baseStats: {hp: 35, atk: 35, def: 40, spa: 35, spd: 55, spe: 50},
        weightkg: 0.5
    },
    skiploom:
    {
        id: 188,
        uid: 247,
        species: "Skiploom",
        abilities: {chlorophyll: 1, leafguard: 2},
        types: ["grass", "flying"],
        baseStats: {hp: 55, atk: 45, def: 50, spa: 45, spd: 65, spe: 80},
        weightkg: 1
    },
    aipom:
    {
        id: 190,
        uid: 248,
        species: "Aipom",
        abilities: {runaway: 1, pickup: 2},
        types: ["normal"],
        baseStats: {hp: 55, atk: 70, def: 55, spa: 40, spd: 55, spe: 85},
        weightkg: 11.5
    },
    sunkern:
    {
        id: 191,
        uid: 249,
        species: "Sunkern",
        abilities: {chlorophyll: 1, solarpower: 2},
        types: ["grass"],
        baseStats: {hp: 30, atk: 30, def: 30, spa: 30, spd: 30, spe: 30},
        weightkg: 1.8
    },
    sunflora:
    {
        id: 192,
        uid: 250,
        species: "Sunflora",
        abilities: {chlorophyll: 1, solarpower: 2},
        types: ["grass"],
        baseStats: {hp: 75, atk: 75, def: 55, spa: 105, spd: 85, spe: 30},
        weightkg: 8.5
    },
    yanma:
    {
        id: 193,
        uid: 251,
        species: "Yanma",
        abilities: {speedboost: 1, compoundeyes: 2},
        types: ["bug", "flying"],
        baseStats: {hp: 65, atk: 65, def: 45, spa: 75, spd: 45, spe: 95},
        weightkg: 38
    },
    wooper:
    {
        id: 194,
        uid: 252,
        species: "Wooper",
        abilities: {damp: 1, waterabsorb: 2},
        types: ["water", "ground"],
        baseStats: {hp: 55, atk: 45, def: 45, spa: 25, spd: 25, spe: 15},
        weightkg: 8.5
    },
    quagsire:
    {
        id: 195,
        uid: 253,
        species: "Quagsire",
        abilities: {damp: 1, waterabsorb: 2},
        types: ["water", "ground"],
        baseStats: {hp: 95, atk: 85, def: 85, spa: 65, spd: 65, spe: 35},
        weightkg: 75
    },
    espeon:
    {
        id: 196,
        uid: 254,
        species: "Espeon",
        abilities: {synchronize: 1},
        types: ["psychic"],
        baseStats: {hp: 65, atk: 65, def: 60, spa: 130, spd: 95, spe: 110},
        weightkg: 26.5
    },
    umbreon:
    {
        id: 197,
        uid: 255,
        species: "Umbreon",
        abilities: {synchronize: 1},
        types: ["dark"],
        baseStats: {hp: 95, atk: 65, def: 110, spa: 60, spd: 130, spe: 65},
        weightkg: 27
    },
    murkrow:
    {
        id: 198,
        uid: 256,
        species: "Murkrow",
        abilities: {insomnia: 1, superluck: 2},
        types: ["dark", "flying"],
        baseStats: {hp: 60, atk: 85, def: 42, spa: 85, spd: 42, spe: 91},
        weightkg: 2.1
    },
    slowking:
    {
        id: 199,
        uid: 257,
        species: "Slowking",
        abilities: {oblivious: 1, owntempo: 2},
        types: ["water", "psychic"],
        baseStats: {hp: 95, atk: 75, def: 80, spa: 100, spd: 110, spe: 30},
        weightkg: 79.5
    },
    misdreavus:
    {
        id: 200,
        uid: 258,
        species: "Misdreavus",
        abilities: {levitate: 1},
        types: ["ghost"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 85, spd: 85, spe: 85},
        weightkg: 1
    },
    unown:
    {
        id: 201,
        uid: 259,
        species: "Unown",
        baseForm: "A",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 48, atk: 72, def: 48, spa: 72, spd: 48, spe: 48},
        weightkg: 5
    },
    wobbuffet:
    {
        id: 202,
        uid: 260,
        species: "Wobbuffet",
        abilities: {shadowtag: 1},
        types: ["psychic"],
        baseStats: {hp: 190, atk: 33, def: 58, spa: 33, spd: 58, spe: 33},
        weightkg: 28.5
    },
    girafarig:
    {
        id: 203,
        uid: 261,
        species: "Girafarig",
        abilities: {innerfocus: 1, earlybird: 2},
        types: ["normal", "psychic"],
        baseStats: {hp: 70, atk: 80, def: 65, spa: 90, spd: 65, spe: 85},
        weightkg: 41.5
    },
    pineco:
    {
        id: 204,
        uid: 262,
        species: "Pineco",
        abilities: {sturdy: 1},
        types: ["bug"],
        baseStats: {hp: 50, atk: 65, def: 90, spa: 35, spd: 35, spe: 15},
        weightkg: 7.2
    },
    forretress:
    {
        id: 205,
        uid: 263,
        species: "Forretress",
        abilities: {sturdy: 1},
        types: ["bug", "steel"],
        baseStats: {hp: 75, atk: 90, def: 140, spa: 60, spd: 60, spe: 40},
        weightkg: 125.8
    },
    dunsparce:
    {
        id: 206,
        uid: 264,
        species: "Dunsparce",
        abilities: {serenegrace: 1, runaway: 2},
        types: ["normal"],
        baseStats: {hp: 100, atk: 70, def: 70, spa: 65, spd: 65, spe: 45},
        weightkg: 14
    },
    gligar:
    {
        id: 207,
        uid: 265,
        species: "Gligar",
        abilities: {hypercutter: 1, sandveil: 2},
        types: ["ground", "flying"],
        baseStats: {hp: 65, atk: 75, def: 105, spa: 35, spd: 65, spe: 85},
        weightkg: 64.8
    },
    steelix:
    {
        id: 208,
        uid: 266,
        species: "Steelix",
        abilities: {rockhead: 1, sturdy: 2},
        types: ["steel", "ground"],
        baseStats: {hp: 75, atk: 85, def: 200, spa: 55, spd: 65, spe: 30},
        weightkg: 400
    },
    scizor:
    {
        id: 212,
        uid: 267,
        species: "Scizor",
        abilities: {swarm: 1, technician: 2},
        types: ["bug", "steel"],
        baseStats: {hp: 70, atk: 130, def: 100, spa: 55, spd: 80, spe: 65},
        weightkg: 118
    },
    shuckle:
    {
        id: 213,
        uid: 268,
        species: "Shuckle",
        abilities: {sturdy: 1, gluttony: 2},
        types: ["bug", "rock"],
        baseStats: {hp: 20, atk: 10, def: 230, spa: 10, spd: 230, spe: 5},
        weightkg: 20.5
    },
    heracross:
    {
        id: 214,
        uid: 269,
        species: "Heracross",
        abilities: {swarm: 1, guts: 2},
        types: ["bug", "fighting"],
        baseStats: {hp: 80, atk: 125, def: 75, spa: 40, spd: 95, spe: 85},
        weightkg: 54
    },
    sneasel:
    {
        id: 215,
        uid: 270,
        species: "Sneasel",
        abilities: {innerfocus: 1, keeneye: 2},
        types: ["dark", "ice"],
        baseStats: {hp: 55, atk: 95, def: 55, spa: 35, spd: 75, spe: 115},
        weightkg: 28
    },
    teddiursa:
    {
        id: 216,
        uid: 271,
        species: "Teddiursa",
        abilities: {pickup: 1, quickfeet: 2},
        types: ["normal"],
        baseStats: {hp: 60, atk: 80, def: 50, spa: 50, spd: 50, spe: 40},
        weightkg: 8.8
    },
    ursaring:
    {
        id: 217,
        uid: 272,
        species: "Ursaring",
        abilities: {guts: 1, quickfeet: 2},
        types: ["normal"],
        baseStats: {hp: 90, atk: 130, def: 75, spa: 75, spd: 75, spe: 55},
        weightkg: 125.8
    },
    slugma:
    {
        id: 218,
        uid: 273,
        species: "Slugma",
        abilities: {magmaarmor: 1, flamebody: 2},
        types: ["fire"],
        baseStats: {hp: 40, atk: 40, def: 40, spa: 70, spd: 40, spe: 20},
        weightkg: 35
    },
    swinub:
    {
        id: 220,
        uid: 274,
        species: "Swinub",
        abilities: {oblivious: 1, snowcloak: 2},
        types: ["ice", "ground"],
        baseStats: {hp: 50, atk: 50, def: 40, spa: 30, spd: 30, spe: 50},
        weightkg: 6.5
    },
    piloswine:
    {
        id: 221,
        uid: 275,
        species: "Piloswine",
        abilities: {oblivious: 1, snowcloak: 2},
        types: ["ice", "ground"],
        baseStats: {hp: 100, atk: 100, def: 80, spa: 60, spd: 60, spe: 50},
        weightkg: 55.8
    },
    remoraid:
    {
        id: 223,
        uid: 276,
        species: "Remoraid",
        abilities: {hustle: 1, sniper: 2},
        types: ["water"],
        baseStats: {hp: 35, atk: 65, def: 35, spa: 65, spd: 35, spe: 65},
        weightkg: 12
    },
    octillery:
    {
        id: 224,
        uid: 277,
        species: "Octillery",
        abilities: {suctioncups: 1, sniper: 2},
        types: ["water"],
        baseStats: {hp: 75, atk: 105, def: 75, spa: 105, spd: 75, spe: 45},
        weightkg: 28.5
    },
    delibird:
    {
        id: 225,
        uid: 278,
        species: "Delibird",
        abilities: {vitalspirit: 1, hustle: 2},
        types: ["ice", "flying"],
        baseStats: {hp: 45, atk: 55, def: 45, spa: 65, spd: 45, spe: 75},
        weightkg: 16
    },
    skarmory:
    {
        id: 227,
        uid: 279,
        species: "Skarmory",
        abilities: {keeneye: 1, sturdy: 2},
        types: ["steel", "flying"],
        baseStats: {hp: 65, atk: 80, def: 140, spa: 40, spd: 70, spe: 70},
        weightkg: 50.5
    },
    houndour:
    {
        id: 228,
        uid: 280,
        species: "Houndour",
        abilities: {earlybird: 1, flashfire: 2},
        types: ["dark", "fire"],
        baseStats: {hp: 45, atk: 60, def: 30, spa: 80, spd: 50, spe: 65},
        weightkg: 10.8
    },
    houndoom:
    {
        id: 229,
        uid: 281,
        species: "Houndoom",
        abilities: {earlybird: 1, flashfire: 2},
        types: ["dark", "fire"],
        baseStats: {hp: 75, atk: 90, def: 50, spa: 110, spd: 80, spe: 95},
        weightkg: 35
    },
    kingdra:
    {
        id: 230,
        uid: 282,
        species: "Kingdra",
        abilities: {swiftswim: 1, sniper: 2},
        types: ["water", "dragon"],
        baseStats: {hp: 75, atk: 95, def: 95, spa: 95, spd: 95, spe: 85},
        weightkg: 152
    },
    phanpy:
    {
        id: 231,
        uid: 283,
        species: "Phanpy",
        abilities: {pickup: 1},
        types: ["ground"],
        baseStats: {hp: 90, atk: 60, def: 60, spa: 40, spd: 40, spe: 40},
        weightkg: 33.5
    },
    donphan:
    {
        id: 232,
        uid: 284,
        species: "Donphan",
        abilities: {sturdy: 1},
        types: ["ground"],
        baseStats: {hp: 90, atk: 120, def: 120, spa: 60, spd: 60, spe: 50},
        weightkg: 120
    },
    porygon2:
    {
        id: 233,
        uid: 285,
        species: "Porygon2",
        abilities: {trace: 1, download: 2},
        types: ["normal"],
        baseStats: {hp: 85, atk: 80, def: 90, spa: 105, spd: 95, spe: 60},
        weightkg: 32.5
    },
    stantler:
    {
        id: 234,
        uid: 286,
        species: "Stantler",
        abilities: {intimidate: 1, frisk: 2},
        types: ["normal"],
        baseStats: {hp: 73, atk: 95, def: 62, spa: 85, spd: 65, spe: 85},
        weightkg: 71.2
    },
    smeargle:
    {
        id: 235,
        uid: 287,
        species: "Smeargle",
        abilities: {owntempo: 1, technician: 2},
        types: ["normal"],
        baseStats: {hp: 55, atk: 20, def: 35, spa: 20, spd: 45, spe: 75},
        weightkg: 58
    },
    tyrogue:
    {
        id: 236,
        uid: 288,
        species: "Tyrogue",
        abilities: {guts: 1, steadfast: 2},
        types: ["fighting"],
        baseStats: {hp: 35, atk: 35, def: 35, spa: 35, spd: 35, spe: 35},
        weightkg: 21
    },
    hitmontop:
    {
        id: 237,
        uid: 289,
        species: "Hitmontop",
        abilities: {intimidate: 1, technician: 2},
        types: ["fighting"],
        baseStats: {hp: 50, atk: 95, def: 95, spa: 35, spd: 110, spe: 70},
        weightkg: 48
    },
    smoochum:
    {
        id: 238,
        uid: 290,
        species: "Smoochum",
        abilities: {oblivious: 1, forewarn: 2},
        types: ["ice", "psychic"],
        baseStats: {hp: 45, atk: 30, def: 15, spa: 85, spd: 65, spe: 65},
        weightkg: 6
    },
    elekid:
    {
        id: 239,
        uid: 291,
        species: "Elekid",
        abilities: {static: 1},
        types: ["electric"],
        baseStats: {hp: 45, atk: 63, def: 37, spa: 65, spd: 55, spe: 95},
        weightkg: 23.5
    },
    magby:
    {
        id: 240,
        uid: 292,
        species: "Magby",
        abilities: {flamebody: 1},
        types: ["fire"],
        baseStats: {hp: 45, atk: 75, def: 37, spa: 70, spd: 55, spe: 83},
        weightkg: 21.4
    },
    miltank:
    {
        id: 241,
        uid: 293,
        species: "Miltank",
        abilities: {thickfat: 1, scrappy: 2},
        types: ["normal"],
        baseStats: {hp: 95, atk: 80, def: 105, spa: 40, spd: 70, spe: 100},
        weightkg: 75.5
    },
    blissey:
    {
        id: 242,
        uid: 294,
        species: "Blissey",
        abilities: {naturalcure: 1, serenegrace: 2},
        types: ["normal"],
        baseStats: {hp: 255, atk: 10, def: 10, spa: 75, spd: 135, spe: 55},
        weightkg: 46.8
    },
    larvitar:
    {
        id: 246,
        uid: 295,
        species: "Larvitar",
        abilities: {guts: 1},
        types: ["rock", "ground"],
        baseStats: {hp: 50, atk: 64, def: 50, spa: 45, spd: 50, spe: 41},
        weightkg: 72
    },
    pupitar:
    {
        id: 247,
        uid: 296,
        species: "Pupitar",
        abilities: {shedskin: 1},
        types: ["rock", "ground"],
        baseStats: {hp: 70, atk: 84, def: 70, spa: 65, spd: 70, spe: 51},
        weightkg: 152
    },
    tyranitar:
    {
        id: 248,
        uid: 297,
        species: "Tyranitar",
        abilities: {sandstream: 1},
        types: ["rock", "dark"],
        baseStats: {hp: 100, atk: 134, def: 110, spa: 95, spd: 100, spe: 61},
        weightkg: 202
    },
    lugia:
    {
        id: 249,
        uid: 298,
        species: "Lugia",
        abilities: {pressure: 1},
        types: ["psychic", "flying"],
        baseStats: {hp: 106, atk: 90, def: 130, spa: 90, spd: 154, spe: 110},
        weightkg: 216
    },
    hooh:
    {
        id: 250,
        uid: 299,
        species: "Ho-Oh",
        abilities: {pressure: 1},
        types: ["fire", "flying"],
        baseStats: {hp: 106, atk: 130, def: 90, spa: 110, spd: 154, spe: 90},
        weightkg: 199
    },
    celebi:
    {
        id: 251,
        uid: 300,
        species: "Celebi",
        abilities: {naturalcure: 1},
        types: ["psychic", "grass"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 5
    },
    treecko:
    {
        id: 252,
        uid: 301,
        species: "Treecko",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 40, atk: 45, def: 35, spa: 65, spd: 55, spe: 70},
        weightkg: 5
    },
    grovyle:
    {
        id: 253,
        uid: 302,
        species: "Grovyle",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 50, atk: 65, def: 45, spa: 85, spd: 65, spe: 95},
        weightkg: 21.6
    },
    sceptile:
    {
        id: 254,
        uid: 303,
        species: "Sceptile",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 70, atk: 85, def: 65, spa: 105, spd: 85, spe: 120},
        weightkg: 52.2
    },
    torchic:
    {
        id: 255,
        uid: 304,
        species: "Torchic",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 45, atk: 60, def: 40, spa: 70, spd: 50, spe: 45},
        weightkg: 2.5
    },
    combusken:
    {
        id: 256,
        uid: 305,
        species: "Combusken",
        abilities: {blaze: 1},
        types: ["fire", "fighting"],
        baseStats: {hp: 60, atk: 85, def: 60, spa: 85, spd: 60, spe: 55},
        weightkg: 19.5
    },
    blaziken:
    {
        id: 257,
        uid: 306,
        species: "Blaziken",
        abilities: {blaze: 1},
        types: ["fire", "fighting"],
        baseStats: {hp: 80, atk: 120, def: 70, spa: 110, spd: 70, spe: 80},
        weightkg: 52
    },
    mudkip:
    {
        id: 258,
        uid: 307,
        species: "Mudkip",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 40},
        weightkg: 7.6
    },
    marshtomp:
    {
        id: 259,
        uid: 308,
        species: "Marshtomp",
        abilities: {torrent: 1},
        types: ["water", "ground"],
        baseStats: {hp: 70, atk: 85, def: 70, spa: 60, spd: 70, spe: 50},
        weightkg: 28
    },
    swampert:
    {
        id: 260,
        uid: 309,
        species: "Swampert",
        abilities: {torrent: 1},
        types: ["water", "ground"],
        baseStats: {hp: 100, atk: 110, def: 90, spa: 85, spd: 90, spe: 60},
        weightkg: 81.9
    },
    poochyena:
    {
        id: 261,
        uid: 310,
        species: "Poochyena",
        abilities: {runaway: 1, quickfeet: 2},
        types: ["dark"],
        baseStats: {hp: 35, atk: 55, def: 35, spa: 30, spd: 30, spe: 35},
        weightkg: 13.6
    },
    mightyena:
    {
        id: 262,
        uid: 311,
        species: "Mightyena",
        abilities: {intimidate: 1, quickfeet: 2},
        types: ["dark"],
        baseStats: {hp: 70, atk: 90, def: 70, spa: 60, spd: 60, spe: 70},
        weightkg: 37
    },
    zigzagoon:
    {
        id: 263,
        uid: 312,
        species: "Zigzagoon",
        abilities: {pickup: 1, gluttony: 2},
        types: ["normal"],
        baseStats: {hp: 38, atk: 30, def: 41, spa: 30, spd: 41, spe: 60},
        weightkg: 17.5
    },
    linoone:
    {
        id: 264,
        uid: 313,
        species: "Linoone",
        abilities: {pickup: 1, gluttony: 2},
        types: ["normal"],
        baseStats: {hp: 78, atk: 70, def: 61, spa: 50, spd: 61, spe: 100},
        weightkg: 32.5
    },
    wurmple:
    {
        id: 265,
        uid: 314,
        species: "Wurmple",
        abilities: {shielddust: 1},
        types: ["bug"],
        baseStats: {hp: 45, atk: 45, def: 35, spa: 20, spd: 30, spe: 20},
        weightkg: 3.6
    },
    silcoon:
    {
        id: 266,
        uid: 315,
        species: "Silcoon",
        abilities: {shedskin: 1},
        types: ["bug"],
        baseStats: {hp: 50, atk: 35, def: 55, spa: 25, spd: 25, spe: 15},
        weightkg: 10
    },
    cascoon:
    {
        id: 268,
        uid: 316,
        species: "Cascoon",
        abilities: {shedskin: 1},
        types: ["bug"],
        baseStats: {hp: 50, atk: 35, def: 55, spa: 25, spd: 25, spe: 15},
        weightkg: 11.5
    },
    dustox:
    {
        id: 269,
        uid: 317,
        species: "Dustox",
        abilities: {shielddust: 1},
        types: ["bug", "poison"],
        baseStats: {hp: 60, atk: 50, def: 70, spa: 50, spd: 90, spe: 65},
        weightkg: 31.6
    },
    lotad:
    {
        id: 270,
        uid: 318,
        species: "Lotad",
        abilities: {swiftswim: 1, raindish: 2},
        types: ["water", "grass"],
        baseStats: {hp: 40, atk: 30, def: 30, spa: 40, spd: 50, spe: 30},
        weightkg: 2.6
    },
    lombre:
    {
        id: 271,
        uid: 319,
        species: "Lombre",
        abilities: {swiftswim: 1, raindish: 2},
        types: ["water", "grass"],
        baseStats: {hp: 60, atk: 50, def: 50, spa: 60, spd: 70, spe: 50},
        weightkg: 32.5
    },
    ludicolo:
    {
        id: 272,
        uid: 320,
        species: "Ludicolo",
        abilities: {swiftswim: 1, raindish: 2},
        types: ["water", "grass"],
        baseStats: {hp: 80, atk: 70, def: 70, spa: 90, spd: 100, spe: 70},
        weightkg: 55
    },
    seedot:
    {
        id: 273,
        uid: 321,
        species: "Seedot",
        abilities: {chlorophyll: 1, earlybird: 2},
        types: ["grass"],
        baseStats: {hp: 40, atk: 40, def: 50, spa: 30, spd: 30, spe: 30},
        weightkg: 4
    },
    nuzleaf:
    {
        id: 274,
        uid: 322,
        species: "Nuzleaf",
        abilities: {chlorophyll: 1, earlybird: 2},
        types: ["grass", "dark"],
        baseStats: {hp: 70, atk: 70, def: 40, spa: 60, spd: 40, spe: 60},
        weightkg: 28
    },
    shiftry:
    {
        id: 275,
        uid: 323,
        species: "Shiftry",
        abilities: {chlorophyll: 1, earlybird: 2},
        types: ["grass", "dark"],
        baseStats: {hp: 90, atk: 100, def: 60, spa: 90, spd: 60, spe: 80},
        weightkg: 59.6
    },
    taillow:
    {
        id: 276,
        uid: 324,
        species: "Taillow",
        abilities: {guts: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 40, atk: 55, def: 30, spa: 30, spd: 30, spe: 85},
        weightkg: 2.3
    },
    surskit:
    {
        id: 283,
        uid: 325,
        species: "Surskit",
        abilities: {swiftswim: 1},
        types: ["bug", "water"],
        baseStats: {hp: 40, atk: 30, def: 32, spa: 50, spd: 52, spe: 65},
        weightkg: 1.7
    },
    shroomish:
    {
        id: 285,
        uid: 326,
        species: "Shroomish",
        abilities: {effectspore: 1, poisonheal: 2},
        types: ["grass"],
        baseStats: {hp: 60, atk: 40, def: 60, spa: 40, spd: 60, spe: 35},
        weightkg: 4.5
    },
    breloom:
    {
        id: 286,
        uid: 327,
        species: "Breloom",
        abilities: {effectspore: 1, poisonheal: 2},
        types: ["grass", "fighting"],
        baseStats: {hp: 60, atk: 130, def: 80, spa: 60, spd: 60, spe: 70},
        weightkg: 39.2
    },
    slakoth:
    {
        id: 287,
        uid: 328,
        species: "Slakoth",
        abilities: {truant: 1},
        types: ["normal"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 35, spd: 35, spe: 30},
        weightkg: 24
    },
    vigoroth:
    {
        id: 288,
        uid: 329,
        species: "Vigoroth",
        abilities: {vitalspirit: 1},
        types: ["normal"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 55, spd: 55, spe: 90},
        weightkg: 46.5
    },
    slaking:
    {
        id: 289,
        uid: 330,
        species: "Slaking",
        abilities: {truant: 1},
        types: ["normal"],
        baseStats: {hp: 150, atk: 160, def: 100, spa: 95, spd: 65, spe: 100},
        weightkg: 130.5
    },
    nincada:
    {
        id: 290,
        uid: 331,
        species: "Nincada",
        abilities: {compoundeyes: 1},
        types: ["bug", "ground"],
        baseStats: {hp: 31, atk: 45, def: 90, spa: 30, spd: 30, spe: 40},
        weightkg: 5.5
    },
    ninjask:
    {
        id: 291,
        uid: 332,
        species: "Ninjask",
        abilities: {speedboost: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 61, atk: 90, def: 45, spa: 50, spd: 50, spe: 160},
        weightkg: 12
    },
    shedinja:
    {
        id: 292,
        uid: 333,
        species: "Shedinja",
        abilities: {wonderguard: 1},
        types: ["bug", "ghost"],
        baseStats: {hp: 1, atk: 90, def: 45, spa: 30, spd: 30, spe: 40},
        weightkg: 1.2
    },
    whismur:
    {
        id: 293,
        uid: 334,
        species: "Whismur",
        abilities: {soundproof: 1},
        types: ["normal"],
        baseStats: {hp: 64, atk: 51, def: 23, spa: 51, spd: 23, spe: 28},
        weightkg: 16.3
    },
    loudred:
    {
        id: 294,
        uid: 335,
        species: "Loudred",
        abilities: {soundproof: 1},
        types: ["normal"],
        baseStats: {hp: 84, atk: 71, def: 43, spa: 71, spd: 43, spe: 48},
        weightkg: 40.5
    },
    makuhita:
    {
        id: 296,
        uid: 336,
        species: "Makuhita",
        abilities: {thickfat: 1, guts: 2},
        types: ["fighting"],
        baseStats: {hp: 72, atk: 60, def: 30, spa: 20, spd: 30, spe: 25},
        weightkg: 86.4
    },
    hariyama:
    {
        id: 297,
        uid: 337,
        species: "Hariyama",
        abilities: {thickfat: 1, guts: 2},
        types: ["fighting"],
        baseStats: {hp: 144, atk: 120, def: 60, spa: 40, spd: 60, spe: 50},
        weightkg: 253.8
    },
    nosepass:
    {
        id: 299,
        uid: 338,
        species: "Nosepass",
        abilities: {sturdy: 1, magnetpull: 2},
        types: ["rock"],
        baseStats: {hp: 30, atk: 45, def: 135, spa: 45, spd: 90, spe: 30},
        weightkg: 97
    },
    skitty:
    {
        id: 300,
        uid: 339,
        species: "Skitty",
        abilities: {cutecharm: 1, normalize: 2},
        types: ["normal"],
        baseStats: {hp: 50, atk: 45, def: 45, spa: 35, spd: 35, spe: 50},
        weightkg: 11
    },
    sableye:
    {
        id: 302,
        uid: 340,
        species: "Sableye",
        abilities: {keeneye: 1, stall: 2},
        types: ["dark", "ghost"],
        baseStats: {hp: 50, atk: 75, def: 75, spa: 65, spd: 65, spe: 50},
        weightkg: 11
    },
    aron:
    {
        id: 304,
        uid: 341,
        species: "Aron",
        abilities: {sturdy: 1, rockhead: 2},
        types: ["steel", "rock"],
        baseStats: {hp: 50, atk: 70, def: 100, spa: 40, spd: 40, spe: 30},
        weightkg: 60
    },
    lairon:
    {
        id: 305,
        uid: 342,
        species: "Lairon",
        abilities: {sturdy: 1, rockhead: 2},
        types: ["steel", "rock"],
        baseStats: {hp: 60, atk: 90, def: 140, spa: 50, spd: 50, spe: 40},
        weightkg: 120
    },
    aggron:
    {
        id: 306,
        uid: 343,
        species: "Aggron",
        abilities: {sturdy: 1, rockhead: 2},
        types: ["steel", "rock"],
        baseStats: {hp: 70, atk: 110, def: 180, spa: 60, spd: 60, spe: 50},
        weightkg: 360
    },
    meditite:
    {
        id: 307,
        uid: 344,
        species: "Meditite",
        abilities: {purepower: 1},
        types: ["fighting", "psychic"],
        baseStats: {hp: 30, atk: 40, def: 55, spa: 40, spd: 55, spe: 60},
        weightkg: 11.2
    },
    medicham:
    {
        id: 308,
        uid: 345,
        species: "Medicham",
        abilities: {purepower: 1},
        types: ["fighting", "psychic"],
        baseStats: {hp: 60, atk: 60, def: 75, spa: 60, spd: 75, spe: 80},
        weightkg: 31.5
    },
    electrike:
    {
        id: 309,
        uid: 346,
        species: "Electrike",
        abilities: {static: 1, lightningrod: 2},
        types: ["electric"],
        baseStats: {hp: 40, atk: 45, def: 40, spa: 65, spd: 40, spe: 65},
        weightkg: 15.2
    },
    manectric:
    {
        id: 310,
        uid: 347,
        species: "Manectric",
        abilities: {static: 1, lightningrod: 2},
        types: ["electric"],
        baseStats: {hp: 70, atk: 75, def: 60, spa: 105, spd: 60, spe: 105},
        weightkg: 40.2
    },
    roselia:
    {
        id: 315,
        uid: 348,
        species: "Roselia",
        abilities: {naturalcure: 1, poisonpoint: 2},
        types: ["grass", "poison"],
        baseStats: {hp: 50, atk: 60, def: 45, spa: 100, spd: 80, spe: 65},
        weightkg: 2
    },
    gulpin:
    {
        id: 316,
        uid: 349,
        species: "Gulpin",
        abilities: {liquidooze: 1, stickyhold: 2},
        types: ["poison"],
        baseStats: {hp: 70, atk: 43, def: 53, spa: 43, spd: 53, spe: 40},
        weightkg: 10.3
    },
    swalot:
    {
        id: 317,
        uid: 350,
        species: "Swalot",
        abilities: {liquidooze: 1, stickyhold: 2},
        types: ["poison"],
        baseStats: {hp: 100, atk: 73, def: 83, spa: 73, spd: 83, spe: 55},
        weightkg: 80
    },
    carvanha:
    {
        id: 318,
        uid: 351,
        species: "Carvanha",
        abilities: {roughskin: 1},
        types: ["water", "dark"],
        baseStats: {hp: 45, atk: 90, def: 20, spa: 65, spd: 20, spe: 65},
        weightkg: 20.8
    },
    sharpedo:
    {
        id: 319,
        uid: 352,
        species: "Sharpedo",
        abilities: {roughskin: 1},
        types: ["water", "dark"],
        baseStats: {hp: 70, atk: 120, def: 40, spa: 95, spd: 40, spe: 95},
        weightkg: 88.8
    },
    wailmer:
    {
        id: 320,
        uid: 353,
        species: "Wailmer",
        abilities: {waterveil: 1, oblivious: 2},
        types: ["water"],
        baseStats: {hp: 130, atk: 70, def: 35, spa: 70, spd: 35, spe: 60},
        weightkg: 130
    },
    wailord:
    {
        id: 321,
        uid: 354,
        species: "Wailord",
        abilities: {waterveil: 1, oblivious: 2},
        types: ["water"],
        baseStats: {hp: 170, atk: 90, def: 45, spa: 90, spd: 45, spe: 60},
        weightkg: 398
    },
    numel:
    {
        id: 322,
        uid: 355,
        species: "Numel",
        abilities: {oblivious: 1, simple: 2},
        types: ["fire", "ground"],
        baseStats: {hp: 60, atk: 60, def: 40, spa: 65, spd: 45, spe: 35},
        weightkg: 24
    },
    camerupt:
    {
        id: 323,
        uid: 356,
        species: "Camerupt",
        abilities: {magmaarmor: 1, solidrock: 2},
        types: ["fire", "ground"],
        baseStats: {hp: 70, atk: 100, def: 70, spa: 105, spd: 75, spe: 40},
        weightkg: 220
    },
    spoink:
    {
        id: 325,
        uid: 357,
        species: "Spoink",
        abilities: {thickfat: 1, owntempo: 2},
        types: ["psychic"],
        baseStats: {hp: 60, atk: 25, def: 35, spa: 70, spd: 80, spe: 60},
        weightkg: 30.6
    },
    grumpig:
    {
        id: 326,
        uid: 358,
        species: "Grumpig",
        abilities: {thickfat: 1, owntempo: 2},
        types: ["psychic"],
        baseStats: {hp: 80, atk: 45, def: 65, spa: 90, spd: 110, spe: 80},
        weightkg: 71.5
    },
    spinda:
    {
        id: 327,
        uid: 359,
        species: "Spinda",
        abilities: {owntempo: 1, tangledfeet: 2},
        types: ["normal"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 60, spd: 60, spe: 60},
        weightkg: 5
    },
    trapinch:
    {
        id: 328,
        uid: 360,
        species: "Trapinch",
        abilities: {hypercutter: 1, arenatrap: 2},
        types: ["ground"],
        baseStats: {hp: 45, atk: 100, def: 45, spa: 45, spd: 45, spe: 10},
        weightkg: 15
    },
    vibrava:
    {
        id: 329,
        uid: 361,
        species: "Vibrava",
        abilities: {levitate: 1},
        types: ["ground", "dragon"],
        baseStats: {hp: 50, atk: 70, def: 50, spa: 50, spd: 50, spe: 70},
        weightkg: 15.3
    },
    flygon:
    {
        id: 330,
        uid: 362,
        species: "Flygon",
        abilities: {levitate: 1},
        types: ["ground", "dragon"],
        baseStats: {hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 100},
        weightkg: 82
    },
    cacnea:
    {
        id: 331,
        uid: 363,
        species: "Cacnea",
        abilities: {sandveil: 1},
        types: ["grass"],
        baseStats: {hp: 50, atk: 85, def: 40, spa: 85, spd: 40, spe: 35},
        weightkg: 51.3
    },
    cacturne:
    {
        id: 332,
        uid: 364,
        species: "Cacturne",
        abilities: {sandveil: 1},
        types: ["grass", "dark"],
        baseStats: {hp: 70, atk: 115, def: 60, spa: 115, spd: 60, spe: 55},
        weightkg: 77.4
    },
    swablu:
    {
        id: 333,
        uid: 365,
        species: "Swablu",
        abilities: {naturalcure: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 45, atk: 40, def: 60, spa: 40, spd: 75, spe: 50},
        weightkg: 1.2
    },
    altaria:
    {
        id: 334,
        uid: 366,
        species: "Altaria",
        abilities: {naturalcure: 1},
        types: ["dragon", "flying"],
        baseStats: {hp: 75, atk: 70, def: 90, spa: 70, spd: 105, spe: 80},
        weightkg: 20.6
    },
    zangoose:
    {
        id: 335,
        uid: 367,
        species: "Zangoose",
        abilities: {immunity: 1},
        types: ["normal"],
        baseStats: {hp: 73, atk: 115, def: 60, spa: 60, spd: 60, spe: 90},
        weightkg: 40.3
    },
    seviper:
    {
        id: 336,
        uid: 368,
        species: "Seviper",
        abilities: {shedskin: 1},
        types: ["poison"],
        baseStats: {hp: 73, atk: 100, def: 60, spa: 100, spd: 60, spe: 65},
        weightkg: 52.5
    },
    barboach:
    {
        id: 339,
        uid: 369,
        species: "Barboach",
        abilities: {oblivious: 1, anticipation: 2},
        types: ["water", "ground"],
        baseStats: {hp: 50, atk: 48, def: 43, spa: 46, spd: 41, spe: 60},
        weightkg: 1.9
    },
    whiscash:
    {
        id: 340,
        uid: 370,
        species: "Whiscash",
        abilities: {oblivious: 1, anticipation: 2},
        types: ["water", "ground"],
        baseStats: {hp: 110, atk: 78, def: 73, spa: 76, spd: 71, spe: 60},
        weightkg: 23.6
    },
    corphish:
    {
        id: 341,
        uid: 371,
        species: "Corphish",
        abilities: {hypercutter: 1, shellarmor: 2},
        types: ["water"],
        baseStats: {hp: 43, atk: 80, def: 65, spa: 50, spd: 35, spe: 35},
        weightkg: 11.5
    },
    crawdaunt:
    {
        id: 342,
        uid: 372,
        species: "Crawdaunt",
        abilities: {hypercutter: 1, shellarmor: 2},
        types: ["water", "dark"],
        baseStats: {hp: 63, atk: 120, def: 85, spa: 90, spd: 55, spe: 55},
        weightkg: 32.8
    },
    baltoy:
    {
        id: 343,
        uid: 373,
        species: "Baltoy",
        abilities: {levitate: 1},
        types: ["ground", "psychic"],
        baseStats: {hp: 40, atk: 40, def: 55, spa: 40, spd: 70, spe: 55},
        weightkg: 21.5
    },
    claydol:
    {
        id: 344,
        uid: 374,
        species: "Claydol",
        abilities: {levitate: 1},
        types: ["ground", "psychic"],
        baseStats: {hp: 60, atk: 70, def: 105, spa: 70, spd: 120, spe: 75},
        weightkg: 108
    },
    lileep:
    {
        id: 345,
        uid: 375,
        species: "Lileep",
        abilities: {suctioncups: 1},
        types: ["rock", "grass"],
        baseStats: {hp: 66, atk: 41, def: 77, spa: 61, spd: 87, spe: 23},
        weightkg: 23.8
    },
    cradily:
    {
        id: 346,
        uid: 376,
        species: "Cradily",
        abilities: {suctioncups: 1},
        types: ["rock", "grass"],
        baseStats: {hp: 86, atk: 81, def: 97, spa: 81, spd: 107, spe: 43},
        weightkg: 60.4
    },
    anorith:
    {
        id: 347,
        uid: 377,
        species: "Anorith",
        abilities: {battlearmor: 1},
        types: ["rock", "bug"],
        baseStats: {hp: 45, atk: 95, def: 50, spa: 40, spd: 50, spe: 75},
        weightkg: 12.5
    },
    armaldo:
    {
        id: 348,
        uid: 378,
        species: "Armaldo",
        abilities: {battlearmor: 1},
        types: ["rock", "bug"],
        baseStats: {hp: 75, atk: 125, def: 100, spa: 70, spd: 80, spe: 45},
        weightkg: 68.2
    },
    feebas:
    {
        id: 349,
        uid: 379,
        species: "Feebas",
        abilities: {swiftswim: 1, oblivious: 2},
        types: ["water"],
        baseStats: {hp: 20, atk: 15, def: 20, spa: 10, spd: 55, spe: 80},
        weightkg: 7.4
    },
    castformsnowy:
    {
        id: 351,
        uid: 380,
        species: "Castform-Snowy",
        baseSpecies: "Castform",
        form: "Snowy",
        formLetter: "S",
        abilities: {forecast: 1},
        types: ["ice"],
        baseStats: {hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70},
        weightkg: 0.8
    },
    shuppet:
    {
        id: 353,
        uid: 381,
        species: "Shuppet",
        abilities: {insomnia: 1, frisk: 2},
        types: ["ghost"],
        baseStats: {hp: 44, atk: 75, def: 35, spa: 63, spd: 33, spe: 45},
        weightkg: 2.3
    },
    banette:
    {
        id: 354,
        uid: 382,
        species: "Banette",
        abilities: {insomnia: 1, frisk: 2},
        types: ["ghost"],
        baseStats: {hp: 64, atk: 115, def: 65, spa: 83, spd: 63, spe: 65},
        weightkg: 12.5
    },
    tropius:
    {
        id: 357,
        uid: 383,
        species: "Tropius",
        abilities: {chlorophyll: 1, solarpower: 2},
        types: ["grass", "flying"],
        baseStats: {hp: 99, atk: 68, def: 83, spa: 72, spd: 87, spe: 51},
        weightkg: 100
    },
    absol:
    {
        id: 359,
        uid: 384,
        species: "Absol",
        abilities: {pressure: 1, superluck: 2},
        types: ["dark"],
        baseStats: {hp: 65, atk: 130, def: 60, spa: 75, spd: 60, spe: 75},
        weightkg: 47
    },
    wynaut:
    {
        id: 360,
        uid: 385,
        species: "Wynaut",
        abilities: {shadowtag: 1},
        types: ["psychic"],
        baseStats: {hp: 95, atk: 23, def: 48, spa: 23, spd: 48, spe: 23},
        weightkg: 14
    },
    snorunt:
    {
        id: 361,
        uid: 386,
        species: "Snorunt",
        abilities: {innerfocus: 1, icebody: 2},
        types: ["ice"],
        baseStats: {hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50},
        weightkg: 16.8
    },
    glalie:
    {
        id: 362,
        uid: 387,
        species: "Glalie",
        abilities: {innerfocus: 1, icebody: 2},
        types: ["ice"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
        weightkg: 256.5
    },
    spheal:
    {
        id: 363,
        uid: 388,
        species: "Spheal",
        abilities: {thickfat: 1, icebody: 2},
        types: ["ice", "water"],
        baseStats: {hp: 70, atk: 40, def: 50, spa: 55, spd: 50, spe: 25},
        weightkg: 39.5
    },
    sealeo:
    {
        id: 364,
        uid: 389,
        species: "Sealeo",
        abilities: {thickfat: 1, icebody: 2},
        types: ["ice", "water"],
        baseStats: {hp: 90, atk: 60, def: 70, spa: 75, spd: 70, spe: 45},
        weightkg: 87.6
    },
    walrein:
    {
        id: 365,
        uid: 390,
        species: "Walrein",
        abilities: {thickfat: 1, icebody: 2},
        types: ["ice", "water"],
        baseStats: {hp: 110, atk: 80, def: 90, spa: 95, spd: 90, spe: 65},
        weightkg: 150.6
    },
    clamperl:
    {
        id: 366,
        uid: 391,
        species: "Clamperl",
        abilities: {shellarmor: 1},
        types: ["water"],
        baseStats: {hp: 35, atk: 64, def: 85, spa: 74, spd: 55, spe: 32},
        weightkg: 52.5
    },
    huntail:
    {
        id: 367,
        uid: 392,
        species: "Huntail",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 55, atk: 104, def: 105, spa: 94, spd: 75, spe: 52},
        weightkg: 27
    },
    gorebyss:
    {
        id: 368,
        uid: 393,
        species: "Gorebyss",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 55, atk: 84, def: 105, spa: 114, spd: 75, spe: 52},
        weightkg: 22.6
    },
    relicanth:
    {
        id: 369,
        uid: 394,
        species: "Relicanth",
        abilities: {swiftswim: 1, rockhead: 2},
        types: ["water", "rock"],
        baseStats: {hp: 100, atk: 90, def: 130, spa: 45, spd: 65, spe: 55},
        weightkg: 23.4
    },
    luvdisc:
    {
        id: 370,
        uid: 395,
        species: "Luvdisc",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 43, atk: 30, def: 55, spa: 40, spd: 65, spe: 97},
        weightkg: 8.7
    },
    bagon:
    {
        id: 371,
        uid: 396,
        species: "Bagon",
        abilities: {rockhead: 1},
        types: ["dragon"],
        baseStats: {hp: 45, atk: 75, def: 60, spa: 40, spd: 30, spe: 50},
        weightkg: 42.1
    },
    shelgon:
    {
        id: 372,
        uid: 397,
        species: "Shelgon",
        abilities: {rockhead: 1},
        types: ["dragon"],
        baseStats: {hp: 65, atk: 95, def: 100, spa: 60, spd: 50, spe: 50},
        weightkg: 110.5
    },
    salamence:
    {
        id: 373,
        uid: 398,
        species: "Salamence",
        abilities: {intimidate: 1},
        types: ["dragon", "flying"],
        baseStats: {hp: 95, atk: 135, def: 80, spa: 110, spd: 80, spe: 100},
        weightkg: 102.6
    },
    beldum:
    {
        id: 374,
        uid: 399,
        species: "Beldum",
        abilities: {clearbody: 1},
        types: ["steel", "psychic"],
        baseStats: {hp: 40, atk: 55, def: 80, spa: 35, spd: 60, spe: 30},
        weightkg: 95.2
    },
    metang:
    {
        id: 375,
        uid: 400,
        species: "Metang",
        abilities: {clearbody: 1},
        types: ["steel", "psychic"],
        baseStats: {hp: 60, atk: 75, def: 100, spa: 55, spd: 80, spe: 50},
        weightkg: 202.5
    },
    metagross:
    {
        id: 376,
        uid: 401,
        species: "Metagross",
        abilities: {clearbody: 1},
        types: ["steel", "psychic"],
        baseStats: {hp: 80, atk: 135, def: 130, spa: 95, spd: 90, spe: 70},
        weightkg: 550
    },
    latias:
    {
        id: 380,
        uid: 402,
        species: "Latias",
        abilities: {levitate: 1},
        types: ["dragon", "psychic"],
        baseStats: {hp: 80, atk: 80, def: 90, spa: 110, spd: 130, spe: 110},
        weightkg: 40
    },
    latios:
    {
        id: 381,
        uid: 403,
        species: "Latios",
        abilities: {levitate: 1},
        types: ["dragon", "psychic"],
        baseStats: {hp: 80, atk: 90, def: 80, spa: 130, spd: 110, spe: 110},
        weightkg: 60
    },
    kyogre:
    {
        id: 382,
        uid: 404,
        species: "Kyogre",
        abilities: {drizzle: 1},
        types: ["water"],
        baseStats: {hp: 100, atk: 100, def: 90, spa: 150, spd: 140, spe: 90},
        weightkg: 352
    },
    groudon:
    {
        id: 383,
        uid: 405,
        species: "Groudon",
        abilities: {drought: 1},
        types: ["ground"],
        baseStats: {hp: 100, atk: 150, def: 140, spa: 100, spd: 90, spe: 90},
        weightkg: 950
    },
    rayquaza:
    {
        id: 384,
        uid: 406,
        species: "Rayquaza",
        abilities: {airlock: 1},
        types: ["dragon", "flying"],
        baseStats: {hp: 105, atk: 150, def: 90, spa: 150, spd: 90, spe: 95},
        weightkg: 206.5
    },
    jirachi:
    {
        id: 385,
        uid: 407,
        species: "Jirachi",
        abilities: {serenegrace: 1},
        types: ["steel", "psychic"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 1.1
    },
    deoxys:
    {
        id: 386,
        uid: 408,
        species: "Deoxys",
        baseForm: "Normal",
        otherForms: ["deoxysattack", "deoxysdefense", "deoxysspeed"],
        abilities: {pressure: 1},
        types: ["psychic"],
        baseStats: {hp: 50, atk: 150, def: 50, spa: 150, spd: 50, spe: 150},
        weightkg: 60.8
    },
    deoxysattack:
    {
        id: 386,
        uid: 409,
        species: "Deoxys-Attack",
        baseSpecies: "Deoxys",
        form: "Attack",
        formLetter: "A",
        abilities: {pressure: 1},
        types: ["psychic"],
        baseStats: {hp: 50, atk: 180, def: 20, spa: 180, spd: 20, spe: 150},
        weightkg: 60.8
    },
    deoxysdefense:
    {
        id: 386,
        uid: 410,
        species: "Deoxys-Defense",
        baseSpecies: "Deoxys",
        form: "Defense",
        formLetter: "D",
        abilities: {pressure: 1},
        types: ["psychic"],
        baseStats: {hp: 50, atk: 70, def: 160, spa: 70, spd: 160, spe: 90},
        weightkg: 60.8
    },
    deoxysspeed:
    {
        id: 386,
        uid: 411,
        species: "Deoxys-Speed",
        baseSpecies: "Deoxys",
        form: "Speed",
        formLetter: "S",
        abilities: {pressure: 1},
        types: ["psychic"],
        baseStats: {hp: 50, atk: 95, def: 90, spa: 95, spd: 90, spe: 180},
        weightkg: 60.8
    },
    turtwig:
    {
        id: 387,
        uid: 412,
        species: "Turtwig",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 55, atk: 68, def: 64, spa: 45, spd: 55, spe: 31},
        weightkg: 10.2
    },
    grotle:
    {
        id: 388,
        uid: 413,
        species: "Grotle",
        abilities: {overgrow: 1},
        types: ["grass"],
        baseStats: {hp: 75, atk: 89, def: 85, spa: 55, spd: 65, spe: 36},
        weightkg: 97
    },
    torterra:
    {
        id: 389,
        uid: 414,
        species: "Torterra",
        abilities: {overgrow: 1},
        types: ["grass", "ground"],
        baseStats: {hp: 95, atk: 109, def: 105, spa: 75, spd: 85, spe: 56},
        weightkg: 310
    },
    chimchar:
    {
        id: 390,
        uid: 415,
        species: "Chimchar",
        abilities: {blaze: 1},
        types: ["fire"],
        baseStats: {hp: 44, atk: 58, def: 44, spa: 58, spd: 44, spe: 61},
        weightkg: 6.2
    },
    monferno:
    {
        id: 391,
        uid: 416,
        species: "Monferno",
        abilities: {blaze: 1},
        types: ["fire", "fighting"],
        baseStats: {hp: 64, atk: 78, def: 52, spa: 78, spd: 52, spe: 81},
        weightkg: 22
    },
    infernape:
    {
        id: 392,
        uid: 417,
        species: "Infernape",
        abilities: {blaze: 1},
        types: ["fire", "fighting"],
        baseStats: {hp: 76, atk: 104, def: 71, spa: 104, spd: 71, spe: 108},
        weightkg: 55
    },
    piplup:
    {
        id: 393,
        uid: 418,
        species: "Piplup",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 53, atk: 51, def: 53, spa: 61, spd: 56, spe: 40},
        weightkg: 5.2
    },
    prinplup:
    {
        id: 394,
        uid: 419,
        species: "Prinplup",
        abilities: {torrent: 1},
        types: ["water"],
        baseStats: {hp: 64, atk: 66, def: 68, spa: 81, spd: 76, spe: 50},
        weightkg: 23
    },
    empoleon:
    {
        id: 395,
        uid: 420,
        species: "Empoleon",
        abilities: {torrent: 1},
        types: ["water", "steel"],
        baseStats: {hp: 84, atk: 86, def: 88, spa: 111, spd: 101, spe: 60},
        weightkg: 84.5
    },
    staravia:
    {
        id: 397,
        uid: 421,
        species: "Staravia",
        abilities: {intimidate: 1},
        types: ["normal", "flying"],
        baseStats: {hp: 55, atk: 75, def: 50, spa: 40, spd: 40, spe: 80},
        weightkg: 15.5
    },
    bidoof:
    {
        id: 399,
        uid: 422,
        species: "Bidoof",
        abilities: {simple: 1, unaware: 2},
        types: ["normal"],
        baseStats: {hp: 59, atk: 45, def: 40, spa: 35, spd: 40, spe: 31},
        weightkg: 20
    },
    bibarel:
    {
        id: 400,
        uid: 423,
        species: "Bibarel",
        abilities: {simple: 1, unaware: 2},
        types: ["normal", "water"],
        baseStats: {hp: 79, atk: 85, def: 60, spa: 55, spd: 60, spe: 71},
        weightkg: 31.5
    },
    kricketot:
    {
        id: 401,
        uid: 424,
        species: "Kricketot",
        abilities: {shedskin: 1},
        types: ["bug"],
        baseStats: {hp: 37, atk: 25, def: 41, spa: 25, spd: 41, spe: 25},
        weightkg: 2.2
    },
    kricketune:
    {
        id: 402,
        uid: 425,
        species: "Kricketune",
        abilities: {swarm: 1},
        types: ["bug"],
        baseStats: {hp: 77, atk: 85, def: 51, spa: 55, spd: 51, spe: 65},
        weightkg: 25.5
    },
    shinx:
    {
        id: 403,
        uid: 426,
        species: "Shinx",
        abilities: {rivalry: 1, intimidate: 2},
        types: ["electric"],
        baseStats: {hp: 45, atk: 65, def: 34, spa: 40, spd: 34, spe: 45},
        weightkg: 9.5
    },
    luxio:
    {
        id: 404,
        uid: 427,
        species: "Luxio",
        abilities: {rivalry: 1, intimidate: 2},
        types: ["electric"],
        baseStats: {hp: 60, atk: 85, def: 49, spa: 60, spd: 49, spe: 60},
        weightkg: 30.5
    },
    luxray:
    {
        id: 405,
        uid: 428,
        species: "Luxray",
        abilities: {rivalry: 1, intimidate: 2},
        types: ["electric"],
        baseStats: {hp: 80, atk: 120, def: 79, spa: 95, spd: 79, spe: 70},
        weightkg: 42
    },
    budew:
    {
        id: 406,
        uid: 429,
        species: "Budew",
        abilities: {naturalcure: 1, poisonpoint: 2},
        types: ["grass", "poison"],
        baseStats: {hp: 40, atk: 30, def: 35, spa: 50, spd: 70, spe: 55},
        weightkg: 1.2
    },
    cranidos:
    {
        id: 408,
        uid: 430,
        species: "Cranidos",
        abilities: {moldbreaker: 1},
        types: ["rock"],
        baseStats: {hp: 67, atk: 125, def: 40, spa: 30, spd: 30, spe: 58},
        weightkg: 31.5
    },
    rampardos:
    {
        id: 409,
        uid: 431,
        species: "Rampardos",
        abilities: {moldbreaker: 1},
        types: ["rock"],
        baseStats: {hp: 97, atk: 165, def: 60, spa: 65, spd: 50, spe: 58},
        weightkg: 102.5
    },
    shieldon:
    {
        id: 410,
        uid: 432,
        species: "Shieldon",
        abilities: {sturdy: 1},
        types: ["rock", "steel"],
        baseStats: {hp: 30, atk: 42, def: 118, spa: 42, spd: 88, spe: 30},
        weightkg: 57
    },
    bastiodon:
    {
        id: 411,
        uid: 433,
        species: "Bastiodon",
        abilities: {sturdy: 1},
        types: ["rock", "steel"],
        baseStats: {hp: 60, atk: 52, def: 168, spa: 47, spd: 138, spe: 30},
        weightkg: 149.5
    },
    mothim:
    {
        id: 414,
        uid: 434,
        species: "Mothim",
        abilities: {swarm: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 94, def: 50, spa: 94, spd: 50, spe: 66},
        weightkg: 23.3
    },
    combee:
    {
        id: 415,
        uid: 435,
        species: "Combee",
        abilities: {honeygather: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 30, atk: 30, def: 42, spa: 30, spd: 42, spe: 70},
        weightkg: 5.5
    },
    vespiquen:
    {
        id: 416,
        uid: 436,
        species: "Vespiquen",
        abilities: {pressure: 1},
        types: ["bug", "flying"],
        baseStats: {hp: 70, atk: 80, def: 102, spa: 80, spd: 102, spe: 40},
        weightkg: 38.5
    },
    pachirisu:
    {
        id: 417,
        uid: 437,
        species: "Pachirisu",
        abilities: {runaway: 1, pickup: 2},
        types: ["electric"],
        baseStats: {hp: 60, atk: 45, def: 70, spa: 45, spd: 90, spe: 95},
        weightkg: 3.9
    },
    buizel:
    {
        id: 418,
        uid: 438,
        species: "Buizel",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 55, atk: 65, def: 35, spa: 60, spd: 30, spe: 85},
        weightkg: 29.5
    },
    floatzel:
    {
        id: 419,
        uid: 439,
        species: "Floatzel",
        abilities: {swiftswim: 1},
        types: ["water"],
        baseStats: {hp: 85, atk: 105, def: 55, spa: 85, spd: 50, spe: 115},
        weightkg: 33.5
    },
    cherubi:
    {
        id: 420,
        uid: 440,
        species: "Cherubi",
        abilities: {chlorophyll: 1},
        types: ["grass"],
        baseStats: {hp: 45, atk: 35, def: 45, spa: 62, spd: 53, spe: 35},
        weightkg: 3.3
    },
    cherrimsunshine:
    {
        id: 421,
        uid: 441,
        species: "Cherrim-Sunshine",
        baseSpecies: "Cherrim",
        form: "Sunshine",
        formLetter: "S",
        abilities: {flowergift: 1},
        types: ["grass"],
        baseStats: {hp: 70, atk: 60, def: 70, spa: 87, spd: 78, spe: 85},
        weightkg: 9.3
    },
    shellos:
    {
        id: 422,
        uid: 442,
        species: "Shellos",
        baseForm: "West",
        abilities: {stickyhold: 1, stormdrain: 2},
        types: ["water"],
        baseStats: {hp: 76, atk: 48, def: 48, spa: 57, spd: 62, spe: 34},
        weightkg: 6.3
    },
    gastrodon:
    {
        id: 423,
        uid: 443,
        species: "Gastrodon",
        baseForm: "West",
        abilities: {stickyhold: 1, stormdrain: 2},
        types: ["water", "ground"],
        baseStats: {hp: 111, atk: 83, def: 68, spa: 92, spd: 82, spe: 39},
        weightkg: 29.9
    },
    ambipom:
    {
        id: 424,
        uid: 444,
        species: "Ambipom",
        abilities: {technician: 1, pickup: 2},
        types: ["normal"],
        baseStats: {hp: 75, atk: 100, def: 66, spa: 60, spd: 66, spe: 115},
        weightkg: 20.3
    },
    drifloon:
    {
        id: 425,
        uid: 445,
        species: "Drifloon",
        abilities: {aftermath: 1, unburden: 2},
        types: ["ghost", "flying"],
        baseStats: {hp: 90, atk: 50, def: 34, spa: 60, spd: 44, spe: 70},
        weightkg: 1.2
    },
    drifblim:
    {
        id: 426,
        uid: 446,
        species: "Drifblim",
        abilities: {aftermath: 1, unburden: 2},
        types: ["ghost", "flying"],
        baseStats: {hp: 150, atk: 80, def: 44, spa: 90, spd: 54, spe: 80},
        weightkg: 15
    },
    buneary:
    {
        id: 427,
        uid: 447,
        species: "Buneary",
        abilities: {runaway: 1, klutz: 2},
        types: ["normal"],
        baseStats: {hp: 55, atk: 66, def: 44, spa: 44, spd: 56, spe: 85},
        weightkg: 5.5
    },
    lopunny:
    {
        id: 428,
        uid: 448,
        species: "Lopunny",
        abilities: {cutecharm: 1, klutz: 2},
        types: ["normal"],
        baseStats: {hp: 65, atk: 76, def: 84, spa: 54, spd: 96, spe: 105},
        weightkg: 33.3
    },
    mismagius:
    {
        id: 429,
        uid: 449,
        species: "Mismagius",
        abilities: {levitate: 1},
        types: ["ghost"],
        baseStats: {hp: 60, atk: 60, def: 60, spa: 105, spd: 105, spe: 105},
        weightkg: 4.4
    },
    honchkrow:
    {
        id: 430,
        uid: 450,
        species: "Honchkrow",
        abilities: {insomnia: 1, superluck: 2},
        types: ["dark", "flying"],
        baseStats: {hp: 100, atk: 125, def: 52, spa: 105, spd: 52, spe: 71},
        weightkg: 27.3
    },
    glameow:
    {
        id: 431,
        uid: 451,
        species: "Glameow",
        abilities: {limber: 1, owntempo: 2},
        types: ["normal"],
        baseStats: {hp: 49, atk: 55, def: 42, spa: 42, spd: 37, spe: 85},
        weightkg: 3.9
    },
    purugly:
    {
        id: 432,
        uid: 452,
        species: "Purugly",
        abilities: {thickfat: 1, owntempo: 2},
        types: ["normal"],
        baseStats: {hp: 71, atk: 82, def: 64, spa: 64, spd: 59, spe: 112},
        weightkg: 43.8
    },
    chingling:
    {
        id: 433,
        uid: 453,
        species: "Chingling",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 45, atk: 30, def: 50, spa: 65, spd: 50, spe: 45},
        weightkg: 0.6
    },
    stunky:
    {
        id: 434,
        uid: 454,
        species: "Stunky",
        abilities: {stench: 1, aftermath: 2},
        types: ["poison", "dark"],
        baseStats: {hp: 63, atk: 63, def: 47, spa: 41, spd: 41, spe: 74},
        weightkg: 19.2
    },
    skuntank:
    {
        id: 435,
        uid: 455,
        species: "Skuntank",
        abilities: {stench: 1, aftermath: 2},
        types: ["poison", "dark"],
        baseStats: {hp: 103, atk: 93, def: 67, spa: 71, spd: 61, spe: 84},
        weightkg: 38
    },
    bronzor:
    {
        id: 436,
        uid: 456,
        species: "Bronzor",
        abilities: {levitate: 1, heatproof: 2},
        types: ["steel", "psychic"],
        baseStats: {hp: 57, atk: 24, def: 86, spa: 24, spd: 86, spe: 23},
        weightkg: 60.5
    },
    bronzong:
    {
        id: 437,
        uid: 457,
        species: "Bronzong",
        abilities: {levitate: 1, heatproof: 2},
        types: ["steel", "psychic"],
        baseStats: {hp: 67, atk: 89, def: 116, spa: 79, spd: 116, spe: 33},
        weightkg: 187
    },
    bonsly:
    {
        id: 438,
        uid: 458,
        species: "Bonsly",
        abilities: {sturdy: 1, rockhead: 2},
        types: ["rock"],
        baseStats: {hp: 50, atk: 80, def: 95, spa: 10, spd: 45, spe: 10},
        weightkg: 15
    },
    happiny:
    {
        id: 440,
        uid: 459,
        species: "Happiny",
        abilities: {naturalcure: 1, serenegrace: 2},
        types: ["normal"],
        baseStats: {hp: 100, atk: 5, def: 5, spa: 15, spd: 65, spe: 30},
        weightkg: 24.4
    },
    chatot:
    {
        id: 441,
        uid: 460,
        species: "Chatot",
        abilities: {keeneye: 1, tangledfeet: 2},
        types: ["normal", "flying"],
        baseStats: {hp: 76, atk: 65, def: 45, spa: 92, spd: 42, spe: 91},
        weightkg: 1.9
    },
    spiritomb:
    {
        id: 442,
        uid: 461,
        species: "Spiritomb",
        abilities: {pressure: 1},
        types: ["ghost", "dark"],
        baseStats: {hp: 50, atk: 92, def: 108, spa: 92, spd: 108, spe: 35},
        weightkg: 108
    },
    gible:
    {
        id: 443,
        uid: 462,
        species: "Gible",
        abilities: {sandveil: 1},
        types: ["dragon", "ground"],
        baseStats: {hp: 58, atk: 70, def: 45, spa: 40, spd: 45, spe: 42},
        weightkg: 20.5
    },
    gabite:
    {
        id: 444,
        uid: 463,
        species: "Gabite",
        abilities: {sandveil: 1},
        types: ["dragon", "ground"],
        baseStats: {hp: 68, atk: 90, def: 65, spa: 50, spd: 55, spe: 82},
        weightkg: 56
    },
    garchomp:
    {
        id: 445,
        uid: 464,
        species: "Garchomp",
        abilities: {sandveil: 1},
        types: ["dragon", "ground"],
        baseStats: {hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102},
        weightkg: 95
    },
    munchlax:
    {
        id: 446,
        uid: 465,
        species: "Munchlax",
        abilities: {pickup: 1, thickfat: 2},
        types: ["normal"],
        baseStats: {hp: 135, atk: 85, def: 40, spa: 40, spd: 85, spe: 5},
        weightkg: 105
    },
    riolu:
    {
        id: 447,
        uid: 466,
        species: "Riolu",
        abilities: {steadfast: 1, innerfocus: 2},
        types: ["fighting"],
        baseStats: {hp: 40, atk: 70, def: 40, spa: 35, spd: 40, spe: 60},
        weightkg: 20.2
    },
    lucario:
    {
        id: 448,
        uid: 467,
        species: "Lucario",
        abilities: {steadfast: 1, innerfocus: 2},
        types: ["fighting", "steel"],
        baseStats: {hp: 70, atk: 110, def: 70, spa: 115, spd: 70, spe: 90},
        weightkg: 54
    },
    hippopotas:
    {
        id: 449,
        uid: 468,
        species: "Hippopotas",
        abilities: {sandstream: 1},
        types: ["ground"],
        baseStats: {hp: 68, atk: 72, def: 78, spa: 38, spd: 42, spe: 32},
        weightkg: 49.5
    },
    hippowdon:
    {
        id: 450,
        uid: 469,
        species: "Hippowdon",
        abilities: {sandstream: 1},
        types: ["ground"],
        baseStats: {hp: 108, atk: 112, def: 118, spa: 68, spd: 72, spe: 47},
        weightkg: 300
    },
    skorupi:
    {
        id: 451,
        uid: 470,
        species: "Skorupi",
        abilities: {battlearmor: 1, sniper: 2},
        types: ["poison", "bug"],
        baseStats: {hp: 40, atk: 50, def: 90, spa: 30, spd: 55, spe: 65},
        weightkg: 12
    },
    drapion:
    {
        id: 452,
        uid: 471,
        species: "Drapion",
        abilities: {battlearmor: 1, sniper: 2},
        types: ["poison", "dark"],
        baseStats: {hp: 70, atk: 90, def: 110, spa: 60, spd: 75, spe: 95},
        weightkg: 61.5
    },
    croagunk:
    {
        id: 453,
        uid: 472,
        species: "Croagunk",
        abilities: {anticipation: 1, dryskin: 2},
        types: ["poison", "fighting"],
        baseStats: {hp: 48, atk: 61, def: 40, spa: 61, spd: 40, spe: 50},
        weightkg: 23
    },
    toxicroak:
    {
        id: 454,
        uid: 473,
        species: "Toxicroak",
        abilities: {anticipation: 1, dryskin: 2},
        types: ["poison", "fighting"],
        baseStats: {hp: 83, atk: 106, def: 65, spa: 86, spd: 65, spe: 85},
        weightkg: 44.4
    },
    carnivine:
    {
        id: 455,
        uid: 474,
        species: "Carnivine",
        abilities: {levitate: 1},
        types: ["grass"],
        baseStats: {hp: 74, atk: 100, def: 72, spa: 90, spd: 72, spe: 46},
        weightkg: 27
    },
    finneon:
    {
        id: 456,
        uid: 475,
        species: "Finneon",
        abilities: {swiftswim: 1, stormdrain: 2},
        types: ["water"],
        baseStats: {hp: 49, atk: 49, def: 56, spa: 49, spd: 61, spe: 66},
        weightkg: 7
    },
    lumineon:
    {
        id: 457,
        uid: 476,
        species: "Lumineon",
        abilities: {swiftswim: 1, stormdrain: 2},
        types: ["water"],
        baseStats: {hp: 69, atk: 69, def: 76, spa: 69, spd: 86, spe: 91},
        weightkg: 24
    },
    mantyke:
    {
        id: 458,
        uid: 477,
        species: "Mantyke",
        abilities: {swiftswim: 1, waterabsorb: 2},
        types: ["water", "flying"],
        baseStats: {hp: 45, atk: 20, def: 50, spa: 60, spd: 120, spe: 50},
        weightkg: 65
    },
    snover:
    {
        id: 459,
        uid: 478,
        species: "Snover",
        abilities: {snowwarning: 1},
        types: ["grass", "ice"],
        baseStats: {hp: 60, atk: 62, def: 50, spa: 62, spd: 60, spe: 40},
        weightkg: 50.5
    },
    abomasnow:
    {
        id: 460,
        uid: 479,
        species: "Abomasnow",
        abilities: {snowwarning: 1},
        types: ["grass", "ice"],
        baseStats: {hp: 90, atk: 92, def: 75, spa: 92, spd: 85, spe: 60},
        weightkg: 135.5
    },
    weavile:
    {
        id: 461,
        uid: 480,
        species: "Weavile",
        abilities: {pressure: 1},
        types: ["dark", "ice"],
        baseStats: {hp: 70, atk: 120, def: 65, spa: 45, spd: 85, spe: 125},
        weightkg: 34
    },
    magnezone:
    {
        id: 462,
        uid: 481,
        species: "Magnezone",
        abilities: {magnetpull: 1, sturdy: 2},
        types: ["electric", "steel"],
        baseStats: {hp: 70, atk: 70, def: 115, spa: 130, spd: 90, spe: 60},
        weightkg: 180
    },
    lickilicky:
    {
        id: 463,
        uid: 482,
        species: "Lickilicky",
        abilities: {owntempo: 1, oblivious: 2},
        types: ["normal"],
        baseStats: {hp: 110, atk: 85, def: 95, spa: 80, spd: 95, spe: 50},
        weightkg: 140
    },
    rhyperior:
    {
        id: 464,
        uid: 483,
        species: "Rhyperior",
        abilities: {lightningrod: 1, solidrock: 2},
        types: ["ground", "rock"],
        baseStats: {hp: 115, atk: 140, def: 130, spa: 55, spd: 55, spe: 40},
        weightkg: 282.8
    },
    tangrowth:
    {
        id: 465,
        uid: 484,
        species: "Tangrowth",
        abilities: {chlorophyll: 1, leafguard: 2},
        types: ["grass"],
        baseStats: {hp: 100, atk: 100, def: 125, spa: 110, spd: 50, spe: 50},
        weightkg: 128.6
    },
    electivire:
    {
        id: 466,
        uid: 485,
        species: "Electivire",
        abilities: {motordrive: 1},
        types: ["electric"],
        baseStats: {hp: 75, atk: 123, def: 67, spa: 95, spd: 85, spe: 95},
        weightkg: 138.6
    },
    magmortar:
    {
        id: 467,
        uid: 486,
        species: "Magmortar",
        abilities: {flamebody: 1},
        types: ["fire"],
        baseStats: {hp: 75, atk: 95, def: 67, spa: 125, spd: 95, spe: 83},
        weightkg: 68
    },
    leafeon:
    {
        id: 470,
        uid: 487,
        species: "Leafeon",
        abilities: {leafguard: 1},
        types: ["grass"],
        baseStats: {hp: 65, atk: 110, def: 130, spa: 60, spd: 65, spe: 95},
        weightkg: 25.5
    },
    glaceon:
    {
        id: 471,
        uid: 488,
        species: "Glaceon",
        abilities: {snowcloak: 1},
        types: ["ice"],
        baseStats: {hp: 65, atk: 60, def: 110, spa: 130, spd: 95, spe: 65},
        weightkg: 25.9
    },
    gliscor:
    {
        id: 472,
        uid: 489,
        species: "Gliscor",
        abilities: {hypercutter: 1, sandveil: 2},
        types: ["ground", "flying"],
        baseStats: {hp: 75, atk: 95, def: 125, spa: 45, spd: 75, spe: 95},
        weightkg: 42.5
    },
    mamoswine:
    {
        id: 473,
        uid: 490,
        species: "Mamoswine",
        abilities: {oblivious: 1, snowcloak: 2},
        types: ["ice", "ground"],
        baseStats: {hp: 110, atk: 130, def: 80, spa: 70, spd: 60, spe: 80},
        weightkg: 291
    },
    porygonz:
    {
        id: 474,
        uid: 491,
        species: "Porygon-Z",
        abilities: {adaptability: 1, download: 2},
        types: ["normal"],
        baseStats: {hp: 85, atk: 80, def: 70, spa: 135, spd: 75, spe: 90},
        weightkg: 34
    },
    gallade:
    {
        id: 475,
        uid: 492,
        species: "Gallade",
        abilities: {steadfast: 1},
        types: ["psychic", "fighting"],
        baseStats: {hp: 68, atk: 125, def: 65, spa: 65, spd: 115, spe: 80},
        weightkg: 52
    },
    probopass:
    {
        id: 476,
        uid: 493,
        species: "Probopass",
        abilities: {sturdy: 1, magnetpull: 2},
        types: ["rock", "steel"],
        baseStats: {hp: 60, atk: 55, def: 145, spa: 75, spd: 150, spe: 40},
        weightkg: 340
    },
    froslass:
    {
        id: 478,
        uid: 494,
        species: "Froslass",
        abilities: {snowcloak: 1},
        types: ["ice", "ghost"],
        baseStats: {hp: 70, atk: 80, def: 70, spa: 80, spd: 70, spe: 110},
        weightkg: 26.6
    },
    rotom:
    {
        id: 479,
        uid: 495,
        species: "Rotom",
        otherForms:
        [
            "rotomheat", "rotomwash", "rotomfrost", "rotomfan", "rotommow"
        ],
        abilities: {levitate: 1},
        types: ["electric", "ghost"],
        baseStats: {hp: 50, atk: 50, def: 77, spa: 95, spd: 77, spe: 91},
        weightkg: 0.3
    },
    uxie:
    {
        id: 480,
        uid: 496,
        species: "Uxie",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 75, atk: 75, def: 130, spa: 75, spd: 130, spe: 95},
        weightkg: 0.3
    },
    mesprit:
    {
        id: 481,
        uid: 497,
        species: "Mesprit",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 80, atk: 105, def: 105, spa: 105, spd: 105, spe: 80},
        weightkg: 0.3
    },
    azelf:
    {
        id: 482,
        uid: 498,
        species: "Azelf",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 75, atk: 125, def: 70, spa: 125, spd: 70, spe: 115},
        weightkg: 0.3
    },
    dialga:
    {
        id: 483,
        uid: 499,
        species: "Dialga",
        abilities: {pressure: 1},
        types: ["steel", "dragon"],
        baseStats: {hp: 100, atk: 120, def: 120, spa: 150, spd: 100, spe: 90},
        weightkg: 683
    },
    palkia:
    {
        id: 484,
        uid: 500,
        species: "Palkia",
        abilities: {pressure: 1},
        types: ["water", "dragon"],
        baseStats: {hp: 90, atk: 120, def: 100, spa: 150, spd: 120, spe: 100},
        weightkg: 336
    },
    regigigas:
    {
        id: 486,
        uid: 501,
        species: "Regigigas",
        abilities: {slowstart: 1},
        types: ["normal"],
        baseStats: {hp: 110, atk: 160, def: 110, spa: 80, spd: 110, spe: 100},
        weightkg: 420
    },
    giratina:
    {
        id: 487,
        uid: 502,
        species: "Giratina",
        baseForm: "Altered",
        otherForms: ["giratinaorigin"],
        abilities: {pressure: 1},
        types: ["ghost", "dragon"],
        baseStats: {hp: 150, atk: 100, def: 120, spa: 100, spd: 120, spe: 90},
        weightkg: 750
    },
    giratinaorigin:
    {
        id: 487,
        uid: 503,
        species: "Giratina-Origin",
        baseSpecies: "Giratina",
        form: "Origin",
        formLetter: "O",
        abilities: {levitate: 1},
        types: ["ghost", "dragon"],
        baseStats: {hp: 150, atk: 120, def: 100, spa: 120, spd: 100, spe: 90},
        weightkg: 650
    },
    cresselia:
    {
        id: 488,
        uid: 504,
        species: "Cresselia",
        abilities: {levitate: 1},
        types: ["psychic"],
        baseStats: {hp: 120, atk: 70, def: 120, spa: 75, spd: 130, spe: 85},
        weightkg: 85.6
    },
    phione:
    {
        id: 489,
        uid: 505,
        species: "Phione",
        abilities: {hydration: 1},
        types: ["water"],
        baseStats: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
        weightkg: 3.1
    },
    manaphy:
    {
        id: 490,
        uid: 506,
        species: "Manaphy",
        abilities: {hydration: 1},
        types: ["water"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 1.4
    },
    darkrai:
    {
        id: 491,
        uid: 507,
        species: "Darkrai",
        abilities: {baddreams: 1},
        types: ["dark"],
        baseStats: {hp: 70, atk: 90, def: 90, spa: 135, spd: 90, spe: 125},
        weightkg: 50.5
    },
    shaymin:
    {
        id: 492,
        uid: 508,
        species: "Shaymin",
        baseForm: "Land",
        otherForms: ["shayminsky"],
        abilities: {naturalcure: 1},
        types: ["grass"],
        baseStats: {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        weightkg: 2.1
    },
    shayminsky:
    {
        id: 492,
        uid: 509,
        species: "Shaymin-Sky",
        baseSpecies: "Shaymin",
        form: "Sky",
        formLetter: "S",
        abilities: {serenegrace: 1},
        types: ["grass", "flying"],
        baseStats: {hp: 100, atk: 103, def: 75, spa: 120, spd: 75, spe: 127},
        weightkg: 5.2
    },
    arceusbug:
    {
        id: 493,
        uid: 510,
        species: "Arceus-Bug",
        baseSpecies: "Arceus",
        form: "Bug",
        formLetter: "B",
        abilities: {multitype: 1},
        types: ["bug"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusdark:
    {
        id: 493,
        uid: 511,
        species: "Arceus-Dark",
        baseSpecies: "Arceus",
        form: "Dark",
        formLetter: "D",
        abilities: {multitype: 1},
        types: ["dark"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusdragon:
    {
        id: 493,
        uid: 512,
        species: "Arceus-Dragon",
        baseSpecies: "Arceus",
        form: "Dragon",
        formLetter: "D",
        abilities: {multitype: 1},
        types: ["dragon"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceuselectric:
    {
        id: 493,
        uid: 513,
        species: "Arceus-Electric",
        baseSpecies: "Arceus",
        form: "Electric",
        formLetter: "E",
        abilities: {multitype: 1},
        types: ["electric"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusfighting:
    {
        id: 493,
        uid: 514,
        species: "Arceus-Fighting",
        baseSpecies: "Arceus",
        form: "Fighting",
        formLetter: "F",
        abilities: {multitype: 1},
        types: ["fighting"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusfire:
    {
        id: 493,
        uid: 515,
        species: "Arceus-Fire",
        baseSpecies: "Arceus",
        form: "Fire",
        formLetter: "F",
        abilities: {multitype: 1},
        types: ["fire"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusflying:
    {
        id: 493,
        uid: 516,
        species: "Arceus-Flying",
        baseSpecies: "Arceus",
        form: "Flying",
        formLetter: "F",
        abilities: {multitype: 1},
        types: ["flying"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusghost:
    {
        id: 493,
        uid: 517,
        species: "Arceus-Ghost",
        baseSpecies: "Arceus",
        form: "Ghost",
        formLetter: "G",
        abilities: {multitype: 1},
        types: ["ghost"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusgrass:
    {
        id: 493,
        uid: 518,
        species: "Arceus-Grass",
        baseSpecies: "Arceus",
        form: "Grass",
        formLetter: "G",
        abilities: {multitype: 1},
        types: ["grass"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusground:
    {
        id: 493,
        uid: 519,
        species: "Arceus-Ground",
        baseSpecies: "Arceus",
        form: "Ground",
        formLetter: "G",
        abilities: {multitype: 1},
        types: ["ground"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusice:
    {
        id: 493,
        uid: 520,
        species: "Arceus-Ice",
        baseSpecies: "Arceus",
        form: "Ice",
        formLetter: "I",
        abilities: {multitype: 1},
        types: ["ice"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceuspoison:
    {
        id: 493,
        uid: 521,
        species: "Arceus-Poison",
        baseSpecies: "Arceus",
        form: "Poison",
        formLetter: "P",
        abilities: {multitype: 1},
        types: ["poison"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceuspsychic:
    {
        id: 493,
        uid: 522,
        species: "Arceus-Psychic",
        baseSpecies: "Arceus",
        form: "Psychic",
        formLetter: "P",
        abilities: {multitype: 1},
        types: ["psychic"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceusrock:
    {
        id: 493,
        uid: 523,
        species: "Arceus-Rock",
        baseSpecies: "Arceus",
        form: "Rock",
        formLetter: "R",
        abilities: {multitype: 1},
        types: ["rock"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceussteel:
    {
        id: 493,
        uid: 524,
        species: "Arceus-Steel",
        baseSpecies: "Arceus",
        form: "Steel",
        formLetter: "S",
        abilities: {multitype: 1},
        types: ["steel"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    },
    arceuswater:
    {
        id: 493,
        uid: 525,
        species: "Arceus-Water",
        baseSpecies: "Arceus",
        form: "Water",
        formLetter: "W",
        abilities: {multitype: 1},
        types: ["water"],
        baseStats: {hp: 120, atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        weightkg: 320
    }
};

/** Contains data for every move in the supported generation. */
const moves: {readonly [name: string]: number} =
{
    absorb: 1,
    acupressure: 2,
    armthrust: 3,
    aromatherapy: 4,
    aquaring: 5,
    assist: 6,
    assurance: 7,
    avalanche: 8,
    barrage: 9,
    beatup: 10,
    bide: 11,
    bind: 12,
    block: 13,
    bonerush: 14,
    bonemerang: 15,
    bounce: 16,
    bravebird: 17,
    brickbreak: 18,
    bugbite: 19,
    bulletseed: 20,
    camouflage: 21,
    chatter: 22,
    clamp: 23,
    cometpunch: 24,
    conversion: 25,
    conversion2: 26,
    copycat: 27,
    cottonspore: 28,
    counter: 29,
    covet: 30,
    crabhammer: 31,
    crushgrip: 32,
    curse: 33,
    defog: 34,
    detect: 35,
    dig: 36,
    disable: 37,
    dive: 38,
    doomdesire: 39,
    doubleedge: 40,
    doublehit: 41,
    doublekick: 42,
    doubleslap: 43,
    drainpunch: 44,
    dreameater: 45,
    earthquake: 46,
    embargo: 47,
    encore: 48,
    endeavor: 49,
    endure: 50,
    explosion: 51,
    extremespeed: 52,
    fakeout: 53,
    feint: 54,
    firefang: 55,
    firespin: 56,
    flail: 57,
    flareblitz: 58,
    fling: 59,
    fly: 60,
    focuspunch: 61,
    followme: 62,
    foresight: 63,
    furyattack: 64,
    furycutter: 65,
    furyswipes: 66,
    futuresight: 67,
    gigadrain: 68,
    glare: 69,
    gravity: 70,
    growth: 71,
    gust: 72,
    hail: 73,
    headsmash: 74,
    healbell: 75,
    healblock: 76,
    healingwish: 77,
    healorder: 78,
    highjumpkick: 79,
    iciclespear: 80,
    imprison: 81,
    ingrain: 82,
    jumpkick: 83,
    knockoff: 84,
    lastresort: 85,
    leechlife: 86,
    lightscreen: 87,
    lockon: 88,
    luckychant: 89,
    lunardance: 90,
    magiccoat: 91,
    magmastorm: 92,
    magnetrise: 93,
    magnitude: 94,
    meanlook: 95,
    mefirst: 96,
    megadrain: 97,
    memento: 98,
    metalburst: 99,
    metronome: 100,
    milkdrink: 101,
    mimic: 102,
    mindreader: 103,
    minimize: 104,
    miracleeye: 105,
    mirrorcoat: 106,
    mirrormove: 107,
    moonlight: 108,
    morningsun: 109,
    mudsport: 110,
    naturalgift: 111,
    naturepower: 112,
    odorsleuth: 113,
    outrage: 114,
    payback: 115,
    petaldance: 116,
    pinmissile: 117,
    pluck: 118,
    poisongas: 119,
    powertrick: 120,
    protect: 121,
    psychup: 122,
    psywave: 123,
    pursuit: 124,
    rapidspin: 125,
    razorwind: 126,
    recover: 127,
    recycle: 128,
    reflect: 129,
    revenge: 130,
    reversal: 131,
    roar: 132,
    rockblast: 133,
    roleplay: 134,
    roost: 135,
    sandtomb: 136,
    sandstorm: 137,
    scaryface: 138,
    secretpower: 139,
    selfdestruct: 140,
    sketch: 141,
    skillswap: 142,
    skyuppercut: 143,
    slackoff: 144,
    sleeptalk: 145,
    smellingsalts: 146,
    snatch: 147,
    softboiled: 148,
    solarbeam: 149,
    spiderweb: 150,
    spikecannon: 151,
    spikes: 152,
    spite: 153,
    spitup: 154,
    stealthrock: 155,
    stomp: 156,
    struggle: 157,
    submission: 158,
    suckerpunch: 159,
    surf: 160,
    swallow: 161,
    switcheroo: 162,
    synthesis: 163,
    tackle: 164,
    tailglow: 165,
    tailwind: 166,
    takedown: 167,
    taunt: 168,
    thief: 169,
    thrash: 170,
    thunder: 171,
    torment: 172,
    toxic: 173,
    toxicspikes: 174,
    transform: 175,
    trick: 176,
    trickroom: 177,
    triplekick: 178,
    twineedle: 179,
    twister: 180,
    uproar: 181,
    uturn: 182,
    volttackle: 183,
    wakeupslap: 184,
    watersport: 185,
    whirlpool: 186,
    whirlwind: 187,
    wish: 188,
    woodhammer: 189,
    worryseed: 190,
    wrap: 191,
    wringout: 192,
    acidarmor: 193,
    aircutter: 194,
    airslash: 195,
    attract: 196,
    aurasphere: 197,
    barrier: 198,
    blizzard: 199,
    bodyslam: 200,
    bubble: 201,
    bugbuzz: 202,
    charm: 203,
    dracometeor: 204,
    dragonpulse: 205,
    dragonrush: 206,
    energyball: 207,
    extrasensory: 208,
    facade: 209,
    fireblast: 210,
    flamethrower: 211,
    grasswhistle: 212,
    growl: 213,
    gunkshot: 214,
    gyroball: 215,
    heatwave: 216,
    hiddenpower: 217,
    hiddenpowerbug: 218,
    hiddenpowerdark: 219,
    hiddenpowerdragon: 220,
    hiddenpowerelectric: 221,
    hiddenpowerfighting: 222,
    hiddenpowerfire: 223,
    hiddenpowerflying: 224,
    hiddenpowerghost: 225,
    hiddenpowergrass: 226,
    hiddenpowerground: 227,
    hiddenpowerice: 228,
    hiddenpowerpoison: 229,
    hiddenpowerpsychic: 230,
    hiddenpowerrock: 231,
    hiddenpowersteel: 232,
    hiddenpowerwater: 233,
    hydropump: 234,
    hypervoice: 235,
    icebeam: 236,
    leafstorm: 237,
    lick: 238,
    metalsound: 239,
    meteormash: 240,
    muddywater: 241,
    overheat: 242,
    perishsong: 243,
    poisonfang: 244,
    poisonpowder: 245,
    powergem: 246,
    psychoshift: 247,
    rocktomb: 248,
    screech: 249,
    shadowforce: 250,
    sing: 251,
    skullbash: 252,
    sleeppowder: 253,
    smog: 254,
    snore: 255,
    spore: 256,
    stringshot: 257,
    stunspore: 258,
    substitute: 259,
    supersonic: 260,
    sweetkiss: 261,
    sweetscent: 262,
    swordsdance: 263,
    thunderbolt: 264,
    vinewhip: 265,
    weatherball: 266,
    willowisp: 267,
    darkvoid: 268,
    destinybond: 269,
    gastroacid: 270,
    iceball: 271,
    rollout: 272,
    sheercold: 273,
    swagger: 274,
    thunderwave: 275,
    acid: 276,
    aerialace: 277,
    aeroblast: 278,
    agility: 279,
    amnesia: 280,
    ancientpower: 281,
    aquajet: 282,
    aquatail: 283,
    astonish: 284,
    attackorder: 285,
    aurorabeam: 286,
    batonpass: 287,
    bellydrum: 288,
    bite: 289,
    blastburn: 290,
    blazekick: 291,
    boneclub: 292,
    brine: 293,
    bubblebeam: 294,
    bulkup: 295,
    bulletpunch: 296,
    calmmind: 297,
    captivate: 298,
    charge: 299,
    chargebeam: 300,
    closecombat: 301,
    confuseray: 302,
    confusion: 303,
    constrict: 304,
    cosmicpower: 305,
    crosschop: 306,
    crosspoison: 307,
    crunch: 308,
    crushclaw: 309,
    cut: 310,
    darkpulse: 311,
    defendorder: 312,
    defensecurl: 313,
    discharge: 314,
    dizzypunch: 315,
    doubleteam: 316,
    dragonbreath: 317,
    dragonclaw: 318,
    dragondance: 319,
    dragonrage: 320,
    drillpeck: 321,
    dynamicpunch: 322,
    earthpower: 323,
    eggbomb: 324,
    ember: 325,
    eruption: 326,
    feintattack: 327,
    faketears: 328,
    falseswipe: 329,
    featherdance: 330,
    firepunch: 331,
    fissure: 332,
    flamewheel: 333,
    flash: 334,
    flashcannon: 335,
    flatter: 336,
    focusblast: 337,
    focusenergy: 338,
    forcepalm: 339,
    frenzyplant: 340,
    frustration: 341,
    gigaimpact: 342,
    grassknot: 343,
    grudge: 344,
    guardswap: 345,
    guillotine: 346,
    hammerarm: 347,
    harden: 348,
    haze: 349,
    headbutt: 350,
    heartswap: 351,
    helpinghand: 352,
    hornattack: 353,
    horndrill: 354,
    howl: 355,
    hydrocannon: 356,
    hyperbeam: 357,
    hyperfang: 358,
    hypnosis: 359,
    icefang: 360,
    icepunch: 361,
    iceshard: 362,
    icywind: 363,
    irondefense: 364,
    ironhead: 365,
    irontail: 366,
    judgment: 367,
    karatechop: 368,
    kinesis: 369,
    lavaplume: 370,
    leafblade: 371,
    leechseed: 372,
    leer: 373,
    lovelykiss: 374,
    lowkick: 375,
    lusterpurge: 376,
    machpunch: 377,
    magicalleaf: 378,
    magnetbomb: 379,
    meditate: 380,
    megakick: 381,
    megapunch: 382,
    megahorn: 383,
    metalclaw: 384,
    mirrorshot: 385,
    mist: 386,
    mistball: 387,
    mudslap: 388,
    mudbomb: 389,
    mudshot: 390,
    nastyplot: 391,
    needlearm: 392,
    nightshade: 393,
    nightslash: 394,
    nightmare: 395,
    octazooka: 396,
    ominouswind: 397,
    painsplit: 398,
    payday: 399,
    peck: 400,
    poisonjab: 401,
    poisonsting: 402,
    poisontail: 403,
    pound: 404,
    powdersnow: 405,
    powerswap: 406,
    powerwhip: 407,
    present: 408,
    psybeam: 409,
    psychic: 410,
    psychoboost: 411,
    psychocut: 412,
    punishment: 413,
    quickattack: 414,
    rage: 415,
    raindance: 416,
    razorleaf: 417,
    refresh: 418,
    rest: 419,
    return: 420,
    roaroftime: 421,
    rockclimb: 422,
    rockpolish: 423,
    rockslide: 424,
    rocksmash: 425,
    rockthrow: 426,
    rockwrecker: 427,
    rollingkick: 428,
    sacredfire: 429,
    safeguard: 430,
    sandattack: 431,
    scratch: 432,
    seedbomb: 433,
    seedflare: 434,
    seismictoss: 435,
    shadowball: 436,
    shadowclaw: 437,
    shadowpunch: 438,
    shadowsneak: 439,
    sharpen: 440,
    shockwave: 441,
    signalbeam: 442,
    silverwind: 443,
    skyattack: 444,
    slam: 445,
    slash: 446,
    sludge: 447,
    sludgebomb: 448,
    smokescreen: 449,
    sonicboom: 450,
    spacialrend: 451,
    spark: 452,
    splash: 453,
    steelwing: 454,
    stockpile: 455,
    stoneedge: 456,
    strength: 457,
    sunnyday: 458,
    superfang: 459,
    superpower: 460,
    swift: 461,
    tailwhip: 462,
    teeterdance: 463,
    teleport: 464,
    thunderfang: 465,
    thunderpunch: 466,
    thundershock: 467,
    tickle: 468,
    triattack: 469,
    trumpcard: 470,
    vacuumwave: 471,
    vicegrip: 472,
    vitalthrow: 473,
    watergun: 474,
    waterpulse: 475,
    waterspout: 476,
    waterfall: 477,
    wingattack: 478,
    withdraw: 479,
    xscissor: 480,
    yawn: 481,
    zapcannon: 482,
    zenheadbutt: 483
};

/** Contains data for every item in the supported generation. */
const items: {readonly [name: string]: number} =
{
    adamantorb: 1,
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
    lifeorb: 13,
    lightball: 14,
    luckypunch: 15,
    lustrousorb: 16,
    mentalherb: 17,
    metronome: 18,
    rowapberry: 19,
    stick: 20,
    thickclub: 21,
    aguavberry: 22,
    apicotberry: 23,
    aspearberry: 24,
    babiriberry: 25,
    belueberry: 26,
    blukberry: 27,
    chartiberry: 28,
    cheriberry: 29,
    chestoberry: 30,
    chilanberry: 31,
    cobaberry: 32,
    colburberry: 33,
    cornnberry: 34,
    durinberry: 35,
    enigmaberry: 36,
    figyberry: 37,
    ganlonberry: 38,
    grepaberry: 39,
    habanberry: 40,
    hondewberry: 41,
    iapapaberry: 42,
    kasibberry: 43,
    kebiaberry: 44,
    kelpsyberry: 45,
    lansatberry: 46,
    leppaberry: 47,
    liechiberry: 48,
    lumberry: 49,
    mail: 50,
    magoberry: 51,
    magostberry: 52,
    micleberry: 53,
    nanabberry: 54,
    nomelberry: 55,
    occaberry: 56,
    oranberry: 57,
    pamtreberry: 58,
    passhoberry: 59,
    payapaberry: 60,
    pechaberry: 61,
    persimberry: 62,
    petayaberry: 63,
    pinapberry: 64,
    pomegberry: 65,
    qualotberry: 66,
    rabutaberry: 67,
    rawstberry: 68,
    razzberry: 69,
    rindoberry: 70,
    salacberry: 71,
    shucaberry: 72,
    sitrusberry: 73,
    souldew: 74,
    spelonberry: 75,
    starfberry: 76,
    tamatoberry: 77,
    tangaberry: 78,
    wacanberry: 79,
    watmelberry: 80,
    wepearberry: 81,
    wikiberry: 82,
    yacheberry: 83,
    bigroot: 84,
    lightclay: 85,
    machobrace: 86,
    armorfossil: 87,
    berryjuice: 88,
    blackbelt: 89,
    blacksludge: 90,
    blackglasses: 91,
    brightpowder: 92,
    charcoal: 93,
    cherishball: 94,
    clawfossil: 95,
    damprock: 96,
    dawnstone: 97,
    destinyknot: 98,
    diveball: 99,
    domefossil: 100,
    dracoplate: 101,
    dragonfang: 102,
    dragonscale: 103,
    dreadplate: 104,
    dubiousdisc: 105,
    duskball: 106,
    duskstone: 107,
    earthplate: 108,
    electirizer: 109,
    energypowder: 110,
    expertbelt: 111,
    fastball: 112,
    firestone: 113,
    fistplate: 114,
    flameorb: 115,
    flameplate: 116,
    focusband: 117,
    friendball: 118,
    fullincense: 119,
    greatball: 120,
    gripclaw: 121,
    hardstone: 122,
    healball: 123,
    heatrock: 124,
    heavyball: 125,
    helixfossil: 126,
    icicleplate: 127,
    icyrock: 128,
    insectplate: 129,
    ironplate: 130,
    kingsrock: 131,
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
    razorfang: 175,
    reapercloth: 176,
    repeatball: 177,
    rockincense: 178,
    rootfossil: 179,
    roseincense: 180,
    safariball: 181,
    scopelens: 182,
    seaincense: 183,
    sharpbeak: 184,
    shedshell: 185,
    shellbell: 186,
    shinystone: 187,
    silkscarf: 188,
    silverpowder: 189,
    skullfossil: 190,
    skyplate: 191,
    smoothrock: 192,
    softsand: 193,
    spelltag: 194,
    splashplate: 195,
    spookyplate: 196,
    sportball: 197,
    stickybarb: 198,
    stoneplate: 199,
    sunstone: 200,
    thunderstone: 201,
    timerball: 202,
    toxicorb: 203,
    toxicplate: 204,
    twistedspoon: 205,
    ultraball: 206,
    upgrade: 207,
    waterstone: 208,
    waveincense: 209,
    whiteherb: 210,
    widelens: 211,
    wiseglasses: 212,
    zapplate: 213,
    zoomlens: 214
};

export const dex: Dex = {pokemon, moves, items};
