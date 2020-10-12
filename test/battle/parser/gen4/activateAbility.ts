import { expect } from "chai";
import "mocha";
import * as effects from "../../../../src/battle/dex/effects";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser } from
    "../../../../src/battle/parser/BattleParser";
import { activateAbility } from
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
        on: effects.ability.On | null = null, hitByMoveName?: string):
        Promise<SubParser>
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

        // can have clearbody or liquidooze
        const tentacruel: events.SwitchOptions =
        {
            species: "tentacruel", level: 100, gender: "M", hp: 364,
            hpMax: 364
        };

        it("Should handle AbilityData#invertDrain flag", async function()
        {
            initActive("us");
            initActive("them", tentacruel);
            await initParser("them", "liquidooze", "damaged");
            await handle({type: "takeDamage", monRef: "us", hp: 94});
            await exitParser();
        });
    });
}
