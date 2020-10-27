import { expect } from "chai";
import "mocha";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { AbilityResult, activateAbility } from
    "../../../../src/battle/parser/gen4/activateAbility";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

/** flamebody pokemon. */
const magmar: events.SwitchOptions =
    {species: "magmar", level: 40, gender: "F", hp: 100, hpMax: 100};

/** colorchange pokemon. */
const kecleon: events.SwitchOptions =
    {species: "kecleon", level: 40, gender: "M", hp: 100, hpMax: 100};

/** roughskin pokemon. */
const sharpedo: events.SwitchOptions =
    {species: "sharpedo", level: 40, gender: "M", hp: 100, hpMax: 100};

export function testActivateAbility(f: () => Context,
    initActive: (monRef: Side, options?: events.SwitchOptions) => Pokemon)
{
    let state: BattleState;
    let pstate: ParserState
    let parser: SubParser;

    beforeEach("Extract Context", function()
    {
        ({state, pstate, parser} = f());
    });

    async function initParser(monRef: Side, ability: string,
        on: effects.ability.On | "preDamage" | null = null,
        hitByMoveName?: string): Promise<SubParser>
    {
        parser = activateAbility(pstate,
            {type: "activateAbility", monRef, ability}, on, hitByMoveName);
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return parser;
    }

    const {handle, reject, exitParser} = createParserHelpers(() => parser);

    it("Should reveal ability", async function()
    {
        const mon = initActive("them");
        expect(mon.ability).to.equal("");
        await initParser("them", "swiftswim");
        expect(mon.ability).to.equal("swiftswim");
    });

    it("Should throw if unknown ability", async function()
    {
        await expect(initParser("us", "invalid"))
            .to.eventually.be.rejectedWith(Error, "Unknown ability 'invalid'");
    });

    describe("AbilityData#explosive", function()
    {
        it("Should infer non-blockExplosive ability for opponent",
        async function()
        {
            // can have damp (blockExplosive ability)
            const golduck: events.SwitchOptions =
            {
                species: "golduck", level: 100, gender: "M", hp: 100,
                hpMax: 100
            };
            initActive("us");
            const mon = initActive("them", golduck);

            expect(mon.traits.ability.possibleValues)
                .to.have.keys(["damp", "cloudnine"]);
            // activate explosive ability
            await initParser("us", "aftermath");
            expect(mon.traits.ability.possibleValues)
                .to.have.keys(["cloudnine"]);
        });
    });

    describe("activateFieldEffect", function()
    {
        describe("weather", function()
        {
            it("Should infer infinite duration if ability matches weather",
            async function()
            {
                initActive("them");
                await initParser("them", "drought");
                await handle(
                {
                    type: "activateFieldEffect", effect: "SunnyDay", start: true
                });
                expect(state.status.weather.type).to.equal("SunnyDay");
                expect(state.status.weather.duration).to.be.null;
                await exitParser();
            });

            it("Should reject if mismatched ability", async function()
            {
                initActive("them");
                await initParser("them", "snowwarning");
                await reject(
                {
                    type: "activateFieldEffect", effect: "SunnyDay", start: true
                });
                expect(state.status.weather.type).to.equal("none");
            });
        });
    });

    describe("activateStatusEffect", function()
    {
        it("Should handle status effect", async function()
        {
            initActive("us");
            initActive("them", magmar);
            await initParser("them", "flamebody", "contact");
            await handle(
            {
                type: "activateStatusEffect", monRef: "us",
                effect: "brn", start: true
            });
            await exitParser();
        });

        it("Should handle if `on` is overqualified", async function()
        {
            initActive("us");
            initActive("them", magmar);
            await initParser("them", "flamebody", "contactKO");
            await handle(
            {
                type: "activateStatusEffect", monRef: "us",
                effect: "brn", start: true
            });
            await exitParser();
        });

        it("Should not handle if `on` is underqualified", async function()
        {
            initActive("us");
            initActive("them", magmar);
            await initParser("them", "flamebody", "damaged");
            await reject(
            {
                type: "activateStatusEffect", monRef: "us",
                effect: "brn", start: true
            });
        });
    });

    describe("changeType", function()
    {
        it("Should handle colorchange ability effect", async function()
        {
            initActive("us");
            initActive("them", kecleon);
            await initParser("them", "colorchange", "damaged", "watergun");
            await handle(
            {
                type: "changeType", monRef: "them",
                newTypes: ["water", "???"]
            });
            await exitParser();
        });
    });

    describe("halt", function()
    {
        it("Should reject", async function()
        {
            initActive("us");
            await initParser("us", "pressure");
            await reject({type: "halt", reason: "decide"});
        });
    });

    describe("revealMove", function()
    {
        describe("warnStrongestMove", function()
        {
            // limited movepool for easier testing
            const wobbuffet: events.SwitchOptions =
            {
                species: "wobbuffet", gender: "M", level: 100, hp: 100,
                hpMax: 100
            };

            // forewarn pokemon
            const hypno: events.SwitchOptions =
            {
                species: "hypno", gender: "M", level: 30, hp: 100,
                hpMax: 100
            };

            it("Should eliminate stronger moves from moveset constraint",
            async function()
            {
                initActive("us", hypno);
                const {moveset} = initActive("them", wobbuffet);
                expect(moveset.constraint).to.include.keys("counter",
                    "mirrorcoat");

                await initParser("us", "forewarn");
                // forewarn doesn't actually activate when the opponent has all
                //  status moves, but this is just for testing purposes
                await handle(
                    {type: "revealMove", monRef: "them", move: "splash"});
                // should remove moves with bp higher than 0 (these two are
                //  treated as 120)
                expect(moveset.constraint).to.not.include.keys("counter",
                    "mirrorcoat");
                await exitParser();
            });
        });
    });

    describe("takeDamage", function()
    {
        it("Should handle percentDamage effect", async function()
        {
            initActive("us");
            initActive("them", sharpedo);
            await initParser("them", "roughskin", "contact");
            await handle({type: "takeDamage", monRef: "us", hp: 94});
            await exitParser();
        });

        describe("absorb", function()
        {
            it("Should handle AbilityData#absorb flag boost on preDamage",
            async function()
            {
                // can have motordrive
                const electivire: events.SwitchOptions =
                {
                    species: "electivire", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };
                initActive("us");
                initActive("them", electivire);
                await initParser("them", "motordrive", "preDamage", "thunder");
                await handle(
                    {type: "boost", monRef: "them", stat: "spe", amount: 1});
                await exitParser<AbilityResult>({immune: true});
            });

            // can have waterabsorb
            const quagsire: events.SwitchOptions =
            {
                species: "quagsire", level: 100, gender: "M", hp: 100,
                hpMax: 100
            };

            it("Should handle AbilityData#absorb flag immune on preDamage",
            async function()
            {
                initActive("us");
                initActive("them", quagsire);
                await initParser("them", "waterabsorb", "preDamage", "bubble");
                await handle({type: "immune", monRef: "them"});
                await exitParser<AbilityResult>({immune: true});
            });

            it("Should handle AbilityData#absorb flag immune on preDamage",
            async function()
            {
                initActive("us");
                initActive("them", quagsire).hp.set(quagsire.hp - 1);
                await initParser("them", "waterabsorb", "preDamage", "bubble");
                await handle({type: "takeDamage", monRef: "them", hp: 364});
                await exitParser<AbilityResult>({immune: true});
            });

            it("Should handle AbilityData#absorb flag status on preDamage",
            async function()
            {
                // can have flashfire
                const arcanine: events.SwitchOptions =
                {
                    species: "arcanine", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };
                initActive("us");
                initActive("them", arcanine);
                await initParser("them", "flashfire", "preDamage", "ember");
                await handle(
                {
                    type: "activateStatusEffect", monRef: "them",
                    effect: "flashFire", start: true
                });
                await exitParser<AbilityResult>({immune: true});
            });
        });

        describe("invertDrain", function()
        {
            // can have liquidooze
            const tentacruel: events.SwitchOptions =
            {
                species: "tentacruel", level: 100, gender: "M", hp: 100,
                hpMax: 100
            };

            it("Should handle AbilityData#invertDrain flag", async function()
            {
                initActive("us");
                initActive("them", tentacruel);
                await initParser("them", "liquidooze", "damaged");
                await handle({type: "takeDamage", monRef: "us", hp: 94});
                await exitParser<AbilityResult>({invertDrain: true});
            });
        });
    });
}
