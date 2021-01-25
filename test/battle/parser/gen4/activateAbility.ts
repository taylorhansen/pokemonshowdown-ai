import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { ParserState, SubParser, SubParserResult } from
    "../../../../src/battle/parser/BattleParser";
import * as ability from "../../../../src/battle/parser/gen4/activateAbility";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { Side } from "../../../../src/battle/state/Side";
import { Context } from "./Context";
import { createParserHelpers } from "./helpers";

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

    const {handle, reject, exitParser} = createParserHelpers(() => parser);

    /** flamebody pokemon. */
    const magmar: events.SwitchOptions =
        {species: "magmar", level: 40, gender: "F", hp: 100, hpMax: 100};

    /** colorchange pokemon. */
    const kecleon: events.SwitchOptions =
        {species: "kecleon", level: 40, gender: "M", hp: 100, hpMax: 100};

    /** roughskin pokemon. */
    const sharpedo: events.SwitchOptions =
        {species: "sharpedo", level: 40, gender: "M", hp: 100, hpMax: 100};

    // can have damp (explosive-blocking ability)
    const golduck: events.SwitchOptions =
    {
        species: "golduck", level: 100, gender: "M", hp: 100,
        hpMax: 100
    };

    // can have clearbody or liquidooze
    const tentacruel: events.SwitchOptions =
        {species: "tentacruel", level: 50, gender: "M", hp: 100, hpMax: 100};

    // can have limber or owntempo
    const glameow: events.SwitchOptions =
        {species: "glameow", level: 50, gender: "F", hp: 100, hpMax: 100};

    // can have naturalcure
    const starmie: events.SwitchOptions =
        {species: "starmie", level: 50, gender: null, hp: 100, hpMax: 100};

    // tests for activateAbility()
    describe("Event", function()
    {
        async function initParser(monRef: Side, abilityName: string,
            on: dexutil.AbilityOn | null = null,
            hitByMoveName?: string): Promise<SubParser>
        {
            parser = ability.activateAbility(pstate,
                {type: "activateAbility", monRef, ability: abilityName}, on,
                hitByMoveName);
            // first yield doesn't return anything
            await expect(parser.next())
                .to.eventually.become({value: undefined, done: false});
            return parser;
        }

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
                .to.eventually.be.rejectedWith(Error, "Unknown ability " +
                    "'invalid'");
        });

        describe("On-switchOut", function()
        {
            describe("Cure (naturalcure)", function()
            {
                it("Should cure status", async function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("par");
                    await initParser("us", "naturalcure", "switchOut");
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "par", start: false
                    });
                    await exitParser();
                });
            });
        });

        describe("On-start", function()
        {
            describe("Cure (immunity)", function()
            {
                it("Should cure status", async function()
                {
                    const mon = initActive("us");
                    mon.majorStatus.afflict("slp");
                    await initParser("us", "insomnia", "start");
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await exitParser();
                });
            });

            describe("CopyFoeAbility (Trace)", function()
            {
                it("Should reveal abilities", async function()
                {
                    initActive("us");
                    const them = initActive("them");
                    await initParser("us", "trace", "start");
                    // trace ability for user
                    await handle(
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "illuminate"
                    });
                    expect(them.ability).to.be.empty;
                    // describe trace target
                    await handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "illuminate"
                    });
                    expect(them.ability).to.equal("illuminate");
                    await exitParser();
                });
            });

            describe("RevealItem (frisk)", function()
            {
                it("Should handle item reveal", async function()
                {
                    initActive("us");
                    initActive("them");
                    await initParser("us", "frisk", "start");
                    await handle(
                    {
                        type: "revealItem", monRef: "them", item: "mail",
                        gained: false
                    });
                    await exitParser();
                });
            });

            describe("WarnStrongestMove (Forewarn)", function()
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

                    await initParser("us", "forewarn", "start");
                    // forewarn doesn't actually activate when the opponent has
                    //  all status moves, but this is just for testing purposes
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

        describe("On-block", function()
        {
            describe("Status", function()
            {
                it("Should block status effect", async function()
                {
                    // can have immunity
                    const snorlax: events.SwitchOptions =
                    {
                        species: "snorlax", level: 100, gender: "M", hp: 100,
                        hpMax: 100
                    };
                    initActive("them", snorlax);
                    await initParser("them", "immunity", "block", "toxic");
                    await handle({type: "immune", monRef: "them"});
                    await exitParser({blockStatus: {psn: true, tox: true}});
                });
            });

            describe("Move", function()
            {
                it("Should handle type immunity", async function()
                {
                    // can have levitate
                    const bronzong: events.SwitchOptions =
                    {
                        species: "bronzong", level: 100, gender: null, hp: 100,
                        hpMax: 100
                    };
                    initActive("us");
                    initActive("them", bronzong);
                    await initParser("them", "levitate", "block", "mudshot");
                    await handle({type: "immune", monRef: "them"});
                    await exitParser({immune: true});
                });

                it("Should handle boost effect", async function()
                {
                    // can have motordrive
                    const electivire: events.SwitchOptions =
                    {
                        species: "electivire", level: 100, gender: "M", hp: 100,
                        hpMax: 100
                    };
                    initActive("us");
                    initActive("them", electivire);
                    await initParser("them", "motordrive", "block", "thunder");
                    await handle(
                    {
                        type: "boost", monRef: "them", stat: "spe", amount: 1
                    });
                    await exitParser({immune: true});
                });

                // can have waterabsorb
                const quagsire: events.SwitchOptions =
                {
                    species: "quagsire", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };

                it("Should handle percentDamage effect", async function()
                {
                    initActive("us");
                    initActive("them", quagsire).hp.set(quagsire.hp - 1);
                    await initParser("them", "waterabsorb", "block", "bubble");
                    await handle({type: "takeDamage", monRef: "them", hp: 100});
                    await exitParser<ability.AbilityResult>({immune: true});
                });

                it("Should handle silent percentDamage effect", async function()
                {
                    initActive("us");
                    initActive("them", quagsire);
                    await initParser("them", "waterabsorb", "block", "bubble");
                    await handle({type: "immune", monRef: "them"});
                    await exitParser({immune: true});
                });

                it("Should handle status effect", async function()
                {
                    // can have flashfire
                    const arcanine: events.SwitchOptions =
                    {
                        species: "arcanine", level: 100, gender: "M", hp: 100,
                        hpMax: 100
                    };
                    initActive("us");
                    initActive("them", arcanine);
                    await initParser("them", "flashfire", "block", "ember");
                    await handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "flashFire", start: true
                    });
                    await exitParser({immune: true});
                });

                it("Should infer hiddenpower type", async function()
                {
                    const {hpType} = initActive("us");
                    expect(hpType.definiteValue).to.be.null;
                    initActive("them", quagsire);

                    await initParser("them", "waterabsorb", "block",
                        "hiddenpower");
                    await handle({type: "immune", monRef: "them"});
                    await exitParser({immune: true});
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer judgment plate type", async function()
                {
                    const {item} = initActive("us");
                    expect(item.definiteValue).to.be.null;
                    initActive("them", quagsire);

                    await initParser("them", "waterabsorb", "block",
                        "judgment");
                    await handle({type: "immune", monRef: "them"});
                    await exitParser({immune: true});
                    expect(item.definiteValue).to.equal("splashplate"); // water
                });
            });

            describe("Effect", function()
            {
                describe("Explosive", function()
                {
                    it("Should block explosive move", async function()
                    {
                        initActive("us");
                        initActive("them", golduck);
                        await initParser("them", "damp", "block", "explosion");
                        await handle({type: "fail"});
                        await exitParser({failed: true});
                    });
                });
            });
        });

        describe("On-tryUnboost", function()
        {
            it("Should indicate blocked unboost effect", async function()
            {
                // can have clearbody (block-unboost ability)
                const metagross: events.SwitchOptions =
                {
                    species: "metagross", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };

                initActive("us");
                initActive("them", metagross);

                await initParser("them", "clearbody", "tryUnboost", "charm");
                await handle({type: "fail"});
                await exitParser({blockUnboost: dexutil.boostNames});
            });
        });

        describe("On-status", function()
        {
            it("Should handle", async function()
            {
                const mon = initActive("us");
                mon.majorStatus.afflict("slp");
                await initParser("us", "insomnia", "status");
                await handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "slp", start: false
                });
                await exitParser();
            });
        });

        describe("On-moveContactKO", function()
        {
            it("Should handle", async function()
            {
                initActive("us");
                initActive("them");
                await initParser("us", "aftermath", "moveContactKO", "tackle");
                await handle({type: "takeDamage", monRef: "them", hp: 75});
                await exitParser();
            });

            describe("explosive", function()
            {
                it("Should infer non-blockExplosive ability for opponent",
                async function()
                {
                    initActive("us");
                    const mon = initActive("them", golduck);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["damp", "cloudnine"]);

                    // activate explosive effect, meaning other side doesn't
                    //  have damp
                    await initParser("us", "aftermath", "moveContactKO",
                        "tackle");
                    await handle({type: "takeDamage", monRef: "them", hp: 75});
                    await exitParser();
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["cloudnine"]);
                });
            });
        });

        describe("On-moveContact", function()
        {
            it("Should handle status effect", async function()
            {
                initActive("us");
                initActive("them", magmar);
                await initParser("them", "flamebody", "moveContact", "tackle");
                await handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "brn", start: true
                });
                await exitParser();
            });

            it("Should handle percentDamage effect", async function()
            {
                initActive("us");
                initActive("them", sharpedo);
                await initParser("them", "roughskin", "moveContact", "tackle");
                await handle({type: "takeDamage", monRef: "us", hp: 94});
                await exitParser();
            });

            it("Should handle if `on` is overqualified and effect targets " +
                "opponent", async function()
            {
                initActive("us");
                initActive("them", magmar);
                await initParser("them", "flamebody", "moveContactKO",
                    "tackle");
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
                await expect(initParser("them", "flamebody", "moveDamage",
                        "watergun"))
                    .to.eventually.be.rejectedWith(Error, "On-moveDamage " +
                        "effect shouldn't activate for ability 'flamebody'");
            });
        });

        describe("On-moveDamage", function()
        {
            describe("ChangeToMoveType (colorchange)", function()
            {
                it("Should handle", async function()
                {
                    initActive("us");
                    initActive("them", kecleon);
                    await initParser("them", "colorchange", "moveDamage",
                        "watergun");
                    await handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await exitParser();
                });

                it("Should infer hiddenpower type", async function()
                {
                    const {hpType} = initActive("us");
                    expect(hpType.definiteValue).to.be.null;
                    initActive("them", kecleon);

                    await initParser("them", "colorchange", "moveDamage",
                        "hiddenpower");
                    await handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await exitParser();
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer judgment plate type", async function()
                {
                    const {item} = initActive("us");
                    expect(item.definiteValue).to.be.null;
                    initActive("them", kecleon);

                    await initParser("them", "colorchange", "moveDamage",
                        "judgment");
                    await handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await exitParser();
                    expect(item.definiteValue).to.equal("splashplate"); // water
                });
            });
        });

        describe("On-moveDrain", function()
        {
            describe("Invert", function()
            {
                it("Should handle", async function()
                {
                    initActive("us");
                    initActive("them", tentacruel);
                    await initParser("them", "liquidooze", "moveDrain",
                        "absorb");
                    await handle({type: "takeDamage", monRef: "us", hp: 94});
                    await exitParser({invertDrain: true});
                });
            });
        });

        // TODO: support in dex data
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
                        type: "activateFieldEffect", effect: "SunnyDay",
                        start: true
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
                        type: "activateFieldEffect", effect: "SunnyDay",
                        start: true
                    });
                    expect(state.status.weather.type).to.equal("none");
                });
            });
        });

        describe("immune", function()
        {
            it("Should handle", async function()
            {
                initActive("us");
                initActive("them");
                await initParser("them", "wonderguard", null, "tackle");
                await handle({type: "immune", monRef: "them"});
                await exitParser({immune: true});
            });
        });
    });

    async function altParser<TParser extends SubParser>(gen: TParser):
        Promise<TParser>
    {
        parser = gen;
        // first yield doesn't return anything
        await expect(parser.next())
            .to.eventually.become({value: undefined, done: false});
        return gen;
    }

    async function rejectParser<TResult = SubParserResult>(
        gen: SubParser<TResult>, baseResult?: TResult):
        Promise<SubParser<TResult>>
    {
        parser = gen;
        await expect(parser.next())
            .to.eventually.become({value: baseResult ?? {}, done: true});
        return gen;
    }

    describe("onSwitchOut()", function()
    {
        it("Should infer no on-switchOut ability if it did not activate",
        async function()
        {
            // can have naturalcure
            const mon = initActive("them", starmie);
            mon.majorStatus.afflict("tox"); // required for this ability
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate", "naturalcure");

            await altParser(ability.onSwitchOut(pstate, {them: true}));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        describe("cure (naturalcure)", function()
        {
            it("Should handle", async function()
            {
                initActive("them", starmie).majorStatus.afflict("brn");
                await altParser(ability.onSwitchOut(pstate, {them: true}));
                await handle(
                {
                    type: "activateAbility", monRef: "them",
                    ability: "naturalcure"
                });
                await handle(
                {
                    type: "activateStatusEffect", monRef: "them", effect: "brn",
                    start: false
                });
                await exitParser<ability.ExpectAbilitiesResult>(
                    {results: [{event: {type: "halt", reason: "decide"}}]});
            });
        });
    });

    describe("onStart()", function()
    {
        it("Should infer no on-start ability if it did not activate",
        async function()
        {
            // can have forewarn
            const hypno: events.SwitchOptions =
                {species: "hypno", level: 50, gender: "M", hp: 100, hpMax: 100};
            const mon = initActive("them", hypno);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("insomnia", "forewarn");

            await altParser(ability.onStart(pstate, {them: true}));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("insomnia");
        });

        describe("revealItem (frisk)", function()
        {
            // can have frisk
            const banette: events.SwitchOptions =
            {
                species: "banette", level: 50, gender: "M", hp: 100, hpMax: 100
            };

            it("Should infer opponent's lack of item if ability is known and " +
                "opponent's item is unknown", async function()
            {
                const mon = initActive("them", banette);
                mon.traits.ability.narrow("frisk");
                // opponent could have an item or no item
                const opp =  initActive("us");
                expect(opp.item.possibleValues).to.include.keys("none");
                expect(opp.item.possibleValues.size).to.be.gt(1);

                await altParser(ability.onStart(pstate, {them: true}));
                await exitParser<ability.ExpectAbilitiesResult>({results: []});
                // opponent definitely has no item
                expect(opp.item.possibleValues).to.have.keys("none");
            });

            it("Should infer no frisk if opponent has item", async function()
            {
                const mon = initActive("them", banette);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
                // opponent definitely has an item
                const opp =  initActive("us");
                opp.item.remove("none");

                await altParser(ability.onStart(pstate, {them: true}));
                await exitParser<ability.ExpectAbilitiesResult>({results: []});
                // should remove frisk
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia");
            });

            it("Should not infer ability if opponent has no item",
            async function()
            {
                const mon = initActive("them", banette);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
                // opponent could have an item or no item
                const opp =  initActive("us");
                opp.setItem("none");

                await altParser(ability.onStart(pstate, {them: true}));
                await exitParser<ability.ExpectAbilitiesResult>({results: []});
                // shouldn't infer ability
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "frisk");
            });
        });
    });

    describe("onBlock()", function()
    {
        // can have voltabsorb
        const lanturn: events.SwitchOptions =
            {species: "lanturn", level: 50, gender: "M", hp: 100, hpMax: 100};

        it("Should reject if move user ignores abilities", async function()
        {
            const mon = initActive("them", lanturn);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");

            initActive("us").setAbility("moldbreaker");
            await rejectParser<ability.ExpectAbilitiesResult>(
                ability.onBlock(pstate, {them: true}, "us",
                    dex.moves.thunderbolt),
                {results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");
        });

        it("Should infer no on-block ability if it did not activate",
        async function()
        {
            const mon = initActive("them", lanturn);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("voltabsorb", "illuminate");

            initActive("us");
            await altParser(ability.onBlock(pstate, {them: true}, "us",
                    dex.moves.thunderbolt));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("illuminate");
        });

        it("Should narrow hiddenpower type if ability didn't activate",
        async function()
        {
            // defender immune to electric through an ability
            const mon = initActive("them", lanturn);
            mon.setAbility("voltabsorb");

            // hpType could be electric
            const {hpType} = initActive("us");
            expect(hpType.definiteValue).to.be.null;
            expect(hpType.possibleValues).to.include("electric");

            // ability didn't activate, so hpType must not be electric
            await altParser(ability.onBlock(pstate, {them: true}, "us",
                    dex.moves.hiddenpower));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(hpType.possibleValues).to.not.include("electric");
        });

        it("Should infer judgment plate type if ability didn't activate",
            async function()
        {
            // defender immune to electric through an ability
            const mon = initActive("them", lanturn);
            mon.setAbility("voltabsorb");

            // plateType could be electric
            const {item} = initActive("us");
            expect(item.definiteValue).to.be.null;
            expect(item.possibleValues).to.include("zapplate"); // electric

            // ability didn't activate, so plateType must not be electric
            await altParser( ability.onBlock(pstate, {them: true}, "us",
                    dex.moves.judgment));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(item.possibleValues).to.not.include("zapplate");
        });
    });

    describe("onTryUnboost()", function()
    {
        it("Should reject if move user ignores abilities", async function()
        {
            const mon = initActive("them", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            initActive("us").setAbility("moldbreaker");
            await rejectParser<ability.ExpectAbilitiesResult>(
                ability.onTryUnboost(pstate, {them: true}, "us",
                    dex.moves.charm),
                {results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");
        });

        it("Should infer no on-tryUnboost ability if it did not activate",
        async function()
        {
            const mon = initActive("them", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            initActive("us");
            await altParser(ability.onTryUnboost(pstate, {them: true}, "us",
                    dex.moves.charm));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("liquidooze");
        });
    });

    describe("onStatus()", function()
    {
        it("Should infer no on-status ability if it did not activate",
        async function()
        {
            const mon = initActive("them", glameow);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("limber", "owntempo");

            await altParser(ability.onStatus(pstate, {them: true}, "confusion",
                    dex.moves.confuseray));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("limber");
        });
    });

    describe("onMoveDamage()", function()
    {
        describe("qualifier=contactKO", function()
        {
            it("Should infer no on-moveContactKO ability if it did not " +
                "activate",
            async function()
            {
                // can have aftermath
                const drifblim: events.SwitchOptions =
                {
                    species: "drifblim", level: 50, gender: "M", hp: 100,
                    hpMax: 100
                };
                const mon = initActive("them", drifblim);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("aftermath", "unburden");

                await altParser(ability.onMoveDamage(pstate, {them: true},
                        "contactKO", "us", dex.moves.tackle));
                await exitParser<ability.ExpectAbilitiesResult>({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("unburden");
            });
        });

        describe("qualifier=contact", function()
        {
            it("Should infer no on-moveContact ability if it did not activate",
            async function()
            {
                const mon = initActive("them", sharpedo);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("roughskin");

                await altParser(ability.onMoveDamage(pstate, {them: true},
                        "contact", "us", dex.moves.tackle));
                await expect(exitParser<ability.ExpectAbilitiesResult>(
                        {results: []}))
                    .to.eventually.be.rejectedWith(
                        "All possibilities have been ruled out " +
                        "(should never happen)");
            });
        });

        describe("qualifier=damage", function()
        {
            describe("changeToMoveType (colorchange)", function()
            {
                it("Should handle", async function()
                {
                    initActive("us", kecleon);
                    initActive("them");
                    await altParser(
                        ability.onMoveDamage(pstate, {us: true}, "damage",
                            "them", dex.moves.watergun));
                    await handle(
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "colorchange"
                    });
                    await handle(
                    {
                        type: "changeType", monRef: "us",
                        newTypes: ["water", "???"]
                    });
                    await exitParser<ability.ExpectAbilitiesResult>(
                        {results: [{event: {type: "halt", reason: "decide"}}]});
                });

                it("Should not activate if KO'd", async function()
                {
                    const mon = initActive("us", kecleon);
                    mon.faint();
                    initActive("them");
                    await altParser(
                        ability.onMoveDamage(pstate, {us: true}, "damage",
                            "them", dex.moves.watergun));
                    await exitParser<ability.ExpectAbilitiesResult>(
                        {results: []});
                });

                it("Should not activate if same type", async function()
                {
                    const mon = initActive("us", kecleon);
                    mon.volatile.changeTypes(["fire", "???"]);
                    initActive("them");
                    await altParser(
                        ability.onMoveDamage(pstate, {us: true}, "damage",
                            "them", dex.moves.ember));
                    await exitParser<ability.ExpectAbilitiesResult>(
                        {results: []});
                });

                it("Should infer hiddenpower type if ability didn't activate",
                async function()
                {
                    const mon = initActive("us", kecleon);
                    mon.volatile.changeTypes(["ghost", "???"]);
                    const {hpType} = initActive("them");
                    expect(hpType.definiteValue).to.be.null;

                    await altParser(
                        ability.onMoveDamage(pstate, {us: true}, "damage",
                            "them", dex.moves.hiddenpower));
                    await exitParser<ability.ExpectAbilitiesResult>(
                        {results: []});
                    expect(hpType.definiteValue).to.equal("ghost");
                });

                it("Should infer judgment plate type if ability didn't " +
                    "activate", async function()
                {
                    const mon = initActive("us", kecleon);
                    mon.volatile.changeTypes(["electric", "???"]);
                    const {item} = initActive("them");
                    expect(item.definiteValue).to.be.null;

                    await altParser(
                        ability.onMoveDamage(pstate, {us: true}, "damage",
                            "them", dex.moves.judgment));
                    await exitParser<ability.ExpectAbilitiesResult>(
                        {results: []});
                    expect(item.definiteValue).to.equal("zapplate"); // electric
                });
            });
        });
    });

    describe("onMoveDrain()", function()
    {
        it("Should infer no on-moveDrain ability if it did not activate",
        async function()
        {
            const mon = initActive("them", tentacruel);
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody", "liquidooze");

            await altParser(ability.onMoveDrain(pstate, {them: true},
                    dex.moves.absorb));
            await exitParser<ability.ExpectAbilitiesResult>({results: []});
            expect(mon.traits.ability.possibleValues)
                .to.have.keys("clearbody");
        });
    });
}
