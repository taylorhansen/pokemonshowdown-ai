/** @file Generates `dex.ts`.  */
import {writeFileSync} from "fs";
import * as path from "path";
import {Generations} from "@pkmn/data";
import {Dex} from "@pkmn/dex";
import {SpeciesAbility} from "@pkmn/dex-types";
import {ESLint} from "eslint";
import * as prettier from "prettier";
import * as dex from "../src/ts/battle/dex/dex-util";
import {toIdName} from "../src/ts/battle/helpers";

// TODO: Most of this can just be (lazily?) computed via the same Dex API at
// runtime rather than pre-computing a giant dex.ts file.

const projectDir = path.resolve(__dirname, "..");
const dexTsPath = path.join(projectDir, "src", "ts", "battle", "dex", "dex.ts");

void (async function buildDex(): Promise<void> {
    const gen = new Generations(Dex).get(4);

    /**
     * Wraps a string in quotes.
     *
     * @param str String to quote.
     * @returns The given string in quotes.
     */
    const quote = (s: unknown) => `"${s}"`;

    /**
     * Wraps a string in quotes if it is an invalid identifier (i.e. it contains
     * dashes, spaces, or quotes).
     *
     * @param str String to quote.
     * @returns The given string if it's a valid identifier, otherwise the
     * string wrapped in quotes.
     */
    const maybeQuote = (s: unknown) =>
        /[^a-zA-Z0-9]/.test(`${s}`) ? quote(s) : `${s}`;

    // Counter for the unique identifier of a pokemon, move, etc.
    let uid = 0;

    //#region Moves.

    const moves: (readonly [string, dex.MoveData])[] = [];

    // Note(gen4): Healingwish-like moves send in a replacement immediately
    // after self-faint.
    /** Secondary map for move name to self-switch effect. */
    const selfSwitchMap: {readonly [move: string]: dex.SelfSwitchType} = {
        healingwish: true,
        lunardance: true,
    };

    const futureMoves: string[] = [];
    const rampageMoves: string[] = [];
    const twoTurnMoves: string[] = [];

    const sketchableMoves: string[] = [];

    uid = 0;
    for (const move of [...gen.moves].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        if (move.realMove ?? move.isNonstandard) {
            continue;
        }

        if (!move.noSketch) {
            sketchableMoves.push(move.id);
        }

        const category = move.category.toLowerCase() as dex.MoveCategory;
        const {basePower} = move;

        const type = move.type.toLowerCase() as dex.Type;

        const {target, nonGhostTarget} = move;

        const maxpp = move.noPPBoosts ? move.pp : Math.floor((move.pp * 8) / 5);
        const pp = [move.pp, maxpp] as const;

        if (move.flags.futuremove && !futureMoves.includes(move.id)) {
            futureMoves.push(move.id);
        }
        if (
            move.self?.volatileStatus === "lockedmove" &&
            !rampageMoves.includes(move.id)
        ) {
            rampageMoves.push(move.id);
        }
        if (move.flags.charge && !twoTurnMoves.includes(move.id)) {
            twoTurnMoves.push(move.id);
        }

        moves[uid] = [
            move.id,
            {
                uid,
                name: move.id,
                display: move.name,
                category,
                basePower,
                ...(move.ohko && {ohko: true}),
                type,
                target,
                ...(nonGhostTarget && {nonGhostTarget}),
                pp,

                ...(move.selfSwitch && {
                    selfSwitch: move.selfSwitch as dex.SelfSwitchType,
                }),
                ...(Object.hasOwnProperty.call(selfSwitchMap, move.id) && {
                    selfSwitch: selfSwitchMap[move.id],
                }),
            },
        ];
        ++uid;
    }

    // Guarantee order.
    futureMoves.sort();
    rampageMoves.sort();
    twoTurnMoves.sort();

    //#endregion

    //#region Pokemon data and abilities.

    const pokemon: (readonly [string, dex.PokemonData])[] = [];

    const abilityNames = new Set<string>();

    uid = 0;
    for (const mon of [...gen.species].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        const baseAbilities: string[] = [];
        for (const index in mon.abilities) {
            if (!Object.hasOwnProperty.call(mon.abilities, index)) {
                continue;
            }
            const abilityName = mon.abilities[index as keyof SpeciesAbility];
            if (!abilityName) {
                continue;
            }
            const abilityId = toIdName(abilityName);
            baseAbilities.push(abilityId);
            if (abilityNames.has(abilityId)) {
                continue;
            }
            abilityNames.add(abilityId);
        }

        const typeArr = mon.types.map(s => s.toLowerCase()) as dex.Type[];
        if (typeArr.length > 2) {
            throw new Error(
                `Too many types for species '${mon.id}': ${typeArr.join(", ")}`,
            );
        } else if (typeArr.length === 1) {
            typeArr.push("???");
        } else if (typeArr.length <= 0) {
            typeArr.push("???", "???");
        }
        const types = typeArr as [dex.Type, dex.Type];

        const stats = mon.baseStats;

        let movepool: string[] = [];
        const learnset = await gen.learnsets.learnable(mon.id);
        for (const moveName in learnset) {
            if (!Object.hasOwnProperty.call(learnset, moveName)) {
                continue;
            }
            const sources = learnset[moveName];
            if (!sources || sources.length <= 0) {
                continue;
            }
            movepool.push(moveName);

            if (moveName === "sketch") {
                movepool = [...new Set([...movepool, ...sketchableMoves])];
            }
        }
        movepool.sort();

        const baseSpecies = mon.baseSpecies && toIdName(mon.baseSpecies);
        const baseForm = mon.baseForme && toIdName(mon.baseForme);
        const form = mon.forme && toIdName(mon.forme);
        let otherForms: string[] | undefined;
        if (mon.otherFormes) {
            const tmp = mon.otherFormes.map(toIdName);
            if (tmp.length > 0) {
                otherForms = tmp.sort();
            }
        }

        const entry: [string, dex.PokemonData] = [
            mon.id,
            {
                uid,
                id: mon.num,
                name: mon.id,
                display: mon.name,
                abilities: baseAbilities,
                types,
                baseStats: stats,
                weightkg: mon.weightkg,
                movepool,
                ...(baseSpecies && baseSpecies !== mon.id && {baseSpecies}),
                ...(baseForm && {baseForm}),
                ...(form && {form}),
                ...(otherForms && {otherForms}),
            },
        ];
        pokemon.push(entry);

        // Also add cosmetic forms.
        // These should have the same uids as the original since they are
        // functionally identical.
        for (const forme of mon.cosmeticFormes ?? []) {
            const mon2 = gen.species.get(forme);
            if (!mon2) {
                continue;
            }
            const [, entryData] = entry;
            // Omit baseForm/otherForms since that's part of the base form entry
            //  But here we're adding a derived form
            const {
                baseForm: _baseForm,
                otherForms: _otherForms,
                ...data
            } = entryData;
            void _baseForm, _otherForms;
            const name = toIdName(forme);
            pokemon.push([
                name,
                {
                    ...data,
                    name,
                    display: forme,
                    ...(baseSpecies && {baseSpecies}),
                    form: toIdName(mon2.forme),
                },
            ]);

            // Add alt form to list.
            entry[1] = {
                ...entry[1],
                otherForms: [...(entry[1].otherForms ?? []), name].sort(),
            };
        }

        // Cherrimsunshine is technically a "cosmetic" form but it changes to it
        // during battle, so keep the same uid for that form.
        if (mon.name !== "Cherrim") {
            ++uid;
        }
    }

    //#endregion

    //#region Ability data.

    const abilities: (readonly [string, dex.AbilityData])[] = [];

    uid = 0;
    for (const ability of [...gen.abilities].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        const data: dex.AbilityData = {
            uid,
            name: ability.id,
            display: ability.name,
        };

        abilities.push([ability.id, data]);
        ++uid;
    }

    //#endregion

    //#region Items.

    const items: (readonly [string, dex.ItemData])[] = [
        // Make sure that having no item is possible.
        ["none", {uid: 0, name: "none", display: "None"}],
    ];

    uid = 1;
    for (const item of [...gen.items].sort((a, b) =>
        a.id < b.id ? -1 : +(a.id > b.id),
    )) {
        const data: dex.ItemData = {
            uid,
            name: item.id,
            display: item.name,
        };

        items.push([item.id, data]);
        ++uid;
    }

    //#endregion

    //#region Write file.

    /**
     * Creates an export dictionary for an array of dictionary entries.
     *
     * @param entries Array to stringify.
     * @param name Name of the dictionary.
     * @param typeName Type name for the dictionary values.
     * @param converter Stringifier for dictionary values.
     * @param indent Number of indent spaces. Default 4.
     */
    function exportEntriesToDict<T>(
        entries: (readonly [string, T])[],
        name: string,
        typeName: string,
        converter: (t: T) => string,
        indent = 4,
    ): string {
        let result =
            `export const ${name}: {readonly [name: string]: ` +
            `${typeName}} = {`;
        const s = " ".repeat(indent);

        for (const [key, value] of entries) {
            result += `\n${s}${maybeQuote(key)}: ${converter(value)},`;
        }
        return result + "\n};";
    }

    /**
     * Recursively stringifies a dictionary.
     *
     * @param dict Dictionary to stringify.
     * @param converter Stringifier for dictionary values.
     */
    function deepStringifyDict(
        dict: Record<string, unknown>,
        converter: (value: unknown) => string,
    ): string {
        const entries: string[] = [];
        for (const key in dict) {
            if (!Object.hasOwnProperty.call(dict, key)) {
                continue;
            }

            let str: string;
            const value = dict[key];
            if (Array.isArray(value)) {
                str = deepStringifyArray(value, converter);
            } else if (typeof value === "object" && value) {
                str = deepStringifyDict(
                    value as {[name: string]: unknown},
                    converter,
                );
            } else {
                str = converter(value);
            }

            entries.push(`${maybeQuote(key)}: ${str}`);
        }
        return "{" + entries.join(", ") + "}";
    }

    /**
     * Recursively stringifies an array.
     *
     * @param arr Array to stringify.
     * @param converter Stringifier for array values.
     */
    function deepStringifyArray(
        arr: unknown[],
        converter: (value: unknown) => string,
    ): string {
        const values: string[] = [];
        for (const value of arr) {
            let str: string;
            if (Array.isArray(value)) {
                str = deepStringifyArray(value, converter);
            } else if (typeof value === "object" && value) {
                str = deepStringifyDict(
                    value as {[name: string]: unknown},
                    converter,
                );
            } else {
                str = converter(value);
            }

            values.push(str);
        }
        return `[${values.join(", ")}]`;
    }

    /**
     * Creates an export array.
     *
     * @param arr Array to stringify.
     * @param name Name of the dictionary.
     * @param typeName Type name for the array values.
     * @param converter Stringifier for array values.
     */
    const exportArray = <T>(
        arr: readonly T[],
        name: string,
        typeName: string,
        converter: (t: T) => string,
    ): string =>
        `export const ${name}: readonly ${typeName}[] = [` +
        arr.map(converter).join(", ") +
        "];";

    /**
     * Creates an export dictionary, string union, etc. for a specific set of
     * moves.
     *
     * @param moves Array of the move names.
     * @param name Name for the variable.
     * @param display Name in the docs. Omit to assume `name` argument.
     */
    function exportSpecificMoves(
        moveNames: readonly string[],
        name: string,
        display = name,
        indent = 4,
    ): string {
        const s = " ".repeat(indent);
        const cap = name.slice(0, 1).toUpperCase() + name.slice(1);

        // Build set of all moves of this specific type.
        return (
            moveNames.reduce(
                (prev, moveName, i) => prev + `\n${s}${moveName}: ${i},`,
                `/**\n * Set of all {@link ${cap}Move ${display}} moves.` +
                    "\n *\n * Maps move name to its id within this object." +
                    `\n */\nexport const ${name}Moves = {`,
            ) +
            `\n} as const;

/** Types of ${display} moves. */
export type ${cap}Move = keyof typeof ${name}Moves;

/** Sorted array of all {@link ${cap}Move ${display}} moves. */
${exportArray(moveNames, `${name}MoveKeys`, `${cap}Move`, quote)}

/** Checks if a value is a {@link ${cap}Move}. */
export function is${cap}Move(value: unknown): value is ${cap}Move {
    return Object.hasOwnProperty.call(${name}Moves, value as PropertyKey);
}`
        );
    }

    let dexTs = `\
// istanbul ignore file
/**
 * @file Contains all the relevant dex data taken from Pokemon Showdown.
 *
 * Generated by ${path.relative(projectDir, __filename)}. Do not edit.
 */
import * as dex from "./dex-util";

/**
 * Contains {@link dex.PokemonData info} about each species, with alternate
 * forms as separate entries.
 */
${exportEntriesToDict(pokemon, "pokemon", "dex.PokemonData", p =>
    deepStringifyDict({...p}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all pokemon names. */
${exportArray(pokemon, "pokemonKeys", "string", ([name]) => quote(name))}

/** Contains {@link dex.AbilityData info} about each ability. */
${exportEntriesToDict(abilities, "abilities", "dex.AbilityData", a =>
    deepStringifyDict({...a}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all ability names. */
${exportArray(abilities, "abilityKeys", "string", ([name]) => quote(name))}

/** Contains {@link dex.MoveData info} about each move. */
${exportEntriesToDict(moves, "moves", "dex.MoveData", m =>
    deepStringifyDict({...m}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all move names. */
${exportArray(moves, "moveKeys", "string", ([name]) => quote(name))}

${exportSpecificMoves(futureMoves, "future")}

${exportSpecificMoves(rampageMoves, "rampage")}

${exportSpecificMoves(twoTurnMoves, "twoTurn", "two-turn")}

/** Contains {@link dex.ItemData info} about each item. */
${exportEntriesToDict(items, "items", "dex.ItemData", i =>
    deepStringifyDict({...i}, v => (typeof v === "string" ? quote(v) : `${v}`)),
)}

/** Sorted array of all item names, except with \`none\` at position 0. */
${exportArray(items, "itemKeys", "string", i => quote(i[0]))}
`;

    const prettierConfig = await prettier.resolveConfig(projectDir, {
        editorconfig: true,
    });
    dexTs = await prettier.format(dexTs, {
        ...(prettierConfig ?? undefined),
        filepath: dexTsPath,
    });

    const eslint = new ESLint({
        cwd: projectDir,
        fix: true,
    });

    const [lintResult] = await eslint.lintText(dexTs, {filePath: dexTsPath});
    for (const msg of lintResult.messages) {
        console.error("Lint(error):", msg);
    }
    console.error(
        "Lint:",
        `${lintResult.fatalErrorCount} fatal,`,
        `${lintResult.errorCount} errors,`,
        `${lintResult.warningCount} warnings`,
    );
    console.error(
        "Lint(fixable):",
        `${lintResult.fixableErrorCount} errors, ${lintResult.fixableWarningCount} warnings`,
    );
    dexTs = lintResult.output ?? lintResult.source ?? dexTs;

    writeFileSync(dexTsPath, dexTs);

    //#endregion
})();
