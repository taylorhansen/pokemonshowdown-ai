import { expect } from "chai";
import "mocha";
import * as dex from "../../../../src/battle/dex/dex";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import * as ability from "../../../../src/battle/parser/gen4/activateAbility";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { Pokemon } from "../../../../src/battle/state/Pokemon";
import { otherSide, Side } from "../../../../src/battle/state/Side";
import { InitialContext, ParserContext } from "./Context";
import { ParserHelpers, setupSubParserPartial, StateHelpers } from "./helpers";

export function testActivateAbility(ictx: InitialContext,
    getState: () => BattleState, sh: StateHelpers)
{
    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = getState();
    });

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
        /** Initializes the activateAbility parser. */
        const init = setupSubParserPartial(ictx.startArgs, getState,
            ability.activateAbility);

        let pctx: ParserContext<ability.AbilityResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        /** Initializes the activateAbility parser with the initial event. */
        async function initWithEvent(monRef: Side, abilityName: string,
            on: dexutil.AbilityOn | null = null, hitByMoveName?: string):
            Promise<void>
        {
            let hitBy: dexutil.MoveAndUserRef | undefined;
            if (hitByMoveName)
            {
                hitBy =
                {
                    move: dex.getMove(hitByMoveName)!,
                    userRef: otherSide(monRef)
                };
            }

            pctx = init(on, hitBy);
            await ph.handle(
                {type: "activateAbility", monRef, ability: abilityName});
        }

        /**
         * Initializes the activateAbility parser and expects it to throw after
         * handling the initial event.
         */
        async function initError(errorCtor: ErrorConstructor, message: string,
            monRef: Side, abilityName: string,
            on: dexutil.AbilityOn | null = null, hitByMoveName?: string):
            Promise<void>
        {
            let hitBy: dexutil.MoveAndUserRef | undefined;
            if (hitByMoveName)
            {
                hitBy =
                {
                    move: dex.getMove(hitByMoveName)!,
                    userRef: otherSide(monRef)
                };
            }

            pctx = init(on, hitBy);
            await ph.rejectError(
                {type: "activateAbility", monRef, ability: abilityName},
                errorCtor, message);
        }

        it("Should reveal ability", async function()
        {
            const mon = sh.initActive("them");
            expect(mon.ability).to.equal("");
            await initWithEvent("them", "swiftswim");
            expect(mon.ability).to.equal("swiftswim");
        });

        it("Should throw if unknown ability", async function()
        {
            await initError(Error, "Unknown ability 'invalid'",
                "us", "invalid");
        });

        describe("On-switchOut", function()
        {
            describe("Cure (naturalcure)", function()
            {
                it("Should cure status", async function()
                {
                    const mon = sh.initActive("us");
                    mon.majorStatus.afflict("par");
                    await initWithEvent("us", "naturalcure", "switchOut");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "par", start: false
                    });
                    await ph.halt({});
                });
            });
        });

        describe("On-start", function()
        {
            describe("Cure (immunity)", function()
            {
                it("Should cure status", async function()
                {
                    const mon = sh.initActive("us");
                    mon.majorStatus.afflict("slp");
                    await initWithEvent("us", "insomnia", "start");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "slp", start: false
                    });
                    await ph.halt({});
                });
            });

            describe("CopyFoeAbility (Trace)", function()
            {
                it("Should reveal abilities", async function()
                {
                    sh.initActive("us");
                    const them = sh.initActive("them");
                    await initWithEvent("us", "trace", "start");
                    // trace ability for user
                    await ph.handle(
                    {
                        type: "activateAbility", monRef: "us",
                        ability: "illuminate"
                    });
                    expect(them.ability).to.be.empty;
                    // describe trace target
                    await ph.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "illuminate"
                    });
                    expect(them.ability).to.equal("illuminate");
                    await ph.halt({});
                });
            });

            describe("RevealItem (frisk)", function()
            {
                it("Should handle item reveal", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them");
                    await initWithEvent("us", "frisk", "start");
                    await ph.handle(
                    {
                        type: "revealItem", monRef: "them", item: "mail",
                        gained: false
                    });
                    await ph.halt({});
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
                    sh.initActive("us", hypno);
                    const {moveset} = sh.initActive("them", wobbuffet);
                    expect(moveset.constraint).to.include.keys("counter",
                        "mirrorcoat");

                    await initWithEvent("us", "forewarn", "start");
                    // forewarn doesn't actually activate when the opponent has
                    //  all status moves, but this is just for testing purposes
                    await ph.handle(
                        {type: "revealMove", monRef: "them", move: "splash"});
                    await ph.halt({});
                    // should remove moves with bp higher than 0 (these two are
                    //  treated as 120)
                    expect(moveset.constraint).to.not.include.keys("counter",
                        "mirrorcoat");
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
                    sh.initActive("them", snorlax);
                    await initWithEvent("them", "immunity", "block", "toxic");
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({blockStatus: {psn: true, tox: true}});
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
                    sh.initActive("us");
                    sh.initActive("them", bronzong);
                    await initWithEvent("them", "levitate", "block", "mudshot");
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({immune: true});
                });

                it("Should handle boost effect", async function()
                {
                    // can have motordrive
                    const electivire: events.SwitchOptions =
                    {
                        species: "electivire", level: 100, gender: "M", hp: 100,
                        hpMax: 100
                    };
                    sh.initActive("us");
                    sh.initActive("them", electivire);
                    await initWithEvent("them", "motordrive", "block",
                            "thunder");
                    await ph.handle(
                    {
                        type: "boost", monRef: "them", stat: "spe", amount: 1
                    });
                    await ph.halt({immune: true});
                });

                // can have waterabsorb
                const quagsire: events.SwitchOptions =
                {
                    species: "quagsire", level: 100, gender: "M", hp: 100,
                    hpMax: 100
                };

                it("Should handle percentDamage effect", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them", quagsire).hp.set(quagsire.hp - 1);
                    await initWithEvent("them", "waterabsorb", "block",
                            "bubble");
                    await ph.handle(
                        {type: "takeDamage", monRef: "them", hp: 100});
                    await ph.halt({immune: true});
                });

                it("Should handle silent percentDamage effect", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them", quagsire);
                    await initWithEvent("them", "waterabsorb", "block",
                            "bubble");
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({immune: true});
                });

                it("Should handle status effect", async function()
                {
                    // can have flashfire
                    const arcanine: events.SwitchOptions =
                    {
                        species: "arcanine", level: 100, gender: "M", hp: 100,
                        hpMax: 100
                    };
                    sh.initActive("us");
                    sh.initActive("them", arcanine);
                    await initWithEvent("them", "flashfire", "block", "ember");
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "flashFire", start: true
                    });
                    await ph.halt({immune: true});
                });

                it("Should infer hiddenpower type", async function()
                {
                    const {hpType} = sh.initActive("us");
                    expect(hpType.definiteValue).to.be.null;
                    sh.initActive("them", quagsire);

                    await initWithEvent("them", "waterabsorb", "block",
                        "hiddenpower");
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({immune: true});
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer judgment plate type", async function()
                {
                    const {item} = sh.initActive("us");
                    expect(item.definiteValue).to.be.null;
                    sh.initActive("them", quagsire);

                    await initWithEvent("them", "waterabsorb", "block",
                        "judgment");
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({immune: true});
                    expect(item.definiteValue).to.equal("splashplate"); // water
                });
            });

            describe("Effect", function()
            {
                describe("Explosive", function()
                {
                    it("Should block explosive move", async function()
                    {
                        sh.initActive("us");
                        sh.initActive("them", golduck);
                        await initWithEvent("them", "damp", "block",
                                "explosion");
                        await ph.handle({type: "fail"});
                        await ph.halt({failed: true});
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

                sh.initActive("us");
                sh.initActive("them", metagross);

                await initWithEvent("them", "clearbody", "tryUnboost", "charm");
                await ph.handle({type: "fail"});
                await ph.halt({blockUnboost: dexutil.boostNames});
            });
        });

        describe("On-status", function()
        {
            it("Should handle", async function()
            {
                const mon = sh.initActive("us");
                mon.majorStatus.afflict("slp");
                await initWithEvent("us", "insomnia", "status");
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "slp", start: false
                });
                await ph.halt({});
            });
        });

        describe("On-moveContactKO", function()
        {
            it("Should handle", async function()
            {
                sh.initActive("us");
                sh.initActive("them");
                await initWithEvent("us", "aftermath", "moveContactKO",
                        "tackle");
                await ph.handle({type: "takeDamage", monRef: "them", hp: 75});
                await ph.halt({});
            });

            describe("explosive", function()
            {
                it("Should infer non-blockExplosive ability for opponent",
                async function()
                {
                    sh.initActive("us");
                    const mon = sh.initActive("them", golduck);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["damp", "cloudnine"]);

                    // activate explosive effect, meaning other side doesn't
                    //  have damp
                    await initWithEvent("us", "aftermath", "moveContactKO",
                        "tackle");
                    await ph.handle(
                        {type: "takeDamage", monRef: "them", hp: 75});
                    await ph.halt({});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys(["cloudnine"]);
                });
            });
        });

        describe("On-moveContact", function()
        {
            it("Should handle status effect", async function()
            {
                sh.initActive("us");
                sh.initActive("them", magmar);
                await initWithEvent("them", "flamebody", "moveContact",
                        "tackle");
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "brn", start: true
                });
                await ph.halt({});
            });

            it("Should handle percentDamage effect", async function()
            {
                sh.initActive("us");
                sh.initActive("them", sharpedo);
                await initWithEvent("them", "roughskin", "moveContact",
                        "tackle");
                await ph.handle({type: "takeDamage", monRef: "us", hp: 94});
                await ph.halt({});
            });

            it("Should handle if `on` is overqualified and effect targets " +
                "opponent", async function()
            {
                sh.initActive("us");
                sh.initActive("them", magmar);
                await initWithEvent("them", "flamebody", "moveContactKO",
                    "tackle");
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "brn", start: true
                });
                await ph.halt({});
            });

            it("Should not handle if `on` is underqualified", async function()
            {
                sh.initActive("us");
                sh.initActive("them", magmar);
                await initError(Error,
                    "On-moveDamage effect shouldn't activate for ability " +
                        "'flamebody'",
                    "them", "flamebody", "moveDamage", "watergun");
            });
        });

        describe("On-moveDamage", function()
        {
            describe("ChangeToMoveType (colorchange)", function()
            {
                it("Should handle", async function()
                {
                    sh.initActive("us");
                    sh.initActive("them", kecleon);
                    await initWithEvent("them", "colorchange", "moveDamage",
                        "watergun");
                    await ph.handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await ph.halt({});
                });

                it("Should infer hiddenpower type", async function()
                {
                    const {hpType} = sh.initActive("us");
                    expect(hpType.definiteValue).to.be.null;
                    sh.initActive("them", kecleon);

                    await initWithEvent("them", "colorchange", "moveDamage",
                        "hiddenpower");
                    await ph.handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await ph.halt({});
                    expect(hpType.definiteValue).to.equal("water");
                });

                it("Should infer judgment plate type", async function()
                {
                    const {item} = sh.initActive("us");
                    expect(item.definiteValue).to.be.null;
                    sh.initActive("them", kecleon);

                    await initWithEvent("them", "colorchange", "moveDamage",
                        "judgment");
                    await ph.handle(
                    {
                        type: "changeType", monRef: "them",
                        newTypes: ["water", "???"]
                    });
                    await ph.halt({});
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
                    sh.initActive("us");
                    sh.initActive("them", tentacruel);
                    await initWithEvent("them", "liquidooze", "moveDrain",
                        "absorb");
                    await ph.handle({type: "takeDamage", monRef: "us", hp: 94});
                    await ph.halt({invertDrain: true});
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
                    sh.initActive("them");
                    await initWithEvent("them", "drought");
                    await ph.handle(
                    {
                        type: "activateFieldEffect", effect: "SunnyDay",
                        start: true
                    });
                    expect(state.status.weather.type).to.equal("SunnyDay");
                    expect(state.status.weather.duration).to.be.null;
                    await ph.halt({});
                });

                it("Should reject if mismatched ability", async function()
                {
                    sh.initActive("them");
                    await initWithEvent("them", "snowwarning");
                    await ph.reject(
                    {
                        type: "activateFieldEffect", effect: "SunnyDay",
                        start: true
                    });
                    expect(state.status.weather.type).to.equal("none");
                });
            });
        });
    });

    describe("Expect functions", function()
    {
        let pctx: ParserContext<ability.ExpectAbilitiesResult>;
        const ph = new ParserHelpers(() => pctx, getState);

        afterEach("Close ParserContext", async function()
        {
            await ph.close();
        });

        describe("onSwitchOut()", function()
        {
            /** Initializes the onSwitchOut parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onSwitchOut);

            it("Should infer no on-switchOut ability if it did not activate",
            async function()
            {
                // can have naturalcure
                const mon = sh.initActive("them", starmie);
                mon.majorStatus.afflict("tox"); // required for this ability
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate", "naturalcure");

                pctx = init({them: true});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate");
            });

            describe("cure (naturalcure)", function()
            {
                it("Should handle", async function()
                {
                    sh.initActive("them", starmie).majorStatus.afflict("brn");
                    pctx = init({them: true});
                    await ph.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "naturalcure"
                    });
                    await ph.handle(
                    {
                        type: "activateStatusEffect", monRef: "them",
                        effect: "brn", start: false
                    });
                    await ph.halt({results: [{}]});
                });
            });
        });

        describe("onStart()", function()
        {
            /** Initializes the onStart parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onStart);

            it("Should infer no on-start ability if it did not activate",
            async function()
            {
                // can have forewarn
                const hypno: events.SwitchOptions =
                {
                    species: "hypno", level: 50, gender: "M", hp: 100,
                    hpMax: 100
                };
                const mon = sh.initActive("them", hypno);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia", "forewarn");

                pctx = init({them: true});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("insomnia");
            });

            describe("revealItem (frisk)", function()
            {
                // can have frisk
                const banette: events.SwitchOptions =
                {
                    species: "banette", level: 50, gender: "M", hp: 100,
                    hpMax: 100
                };

                it("Should infer opponent's lack of item if ability is known " +
                    "and opponent's item is unknown", async function()
                {
                    const mon = sh.initActive("them", banette);
                    mon.traits.ability.narrow("frisk");
                    // opponent could have an item or no item
                    const opp =  sh.initActive("us");
                    expect(opp.item.possibleValues).to.include.keys("none");
                    expect(opp.item.size).to.be.gt(1);

                    pctx = init({them: true});
                    await ph.halt({results: []});
                    // opponent definitely has no item
                    expect(opp.item.possibleValues).to.have.keys("none");
                });

                it("Should infer no frisk if opponent has item",
                async function()
                {
                    const mon = sh.initActive("them", banette);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("insomnia", "frisk");
                    // opponent definitely has an item
                    const opp =  sh.initActive("us");
                    opp.item.remove("none");

                    pctx = init({them: true});
                    await ph.halt({results: []});
                    // should remove frisk
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("insomnia");
                });

                it("Should not infer ability if opponent has no item",
                async function()
                {
                    const mon = sh.initActive("them", banette);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("insomnia", "frisk");
                    // opponent could have an item or no item
                    const opp =  sh.initActive("us");
                    opp.setItem("none");

                    pctx = init({them: true});
                    await ph.halt({results: []});
                    // shouldn't infer ability
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("insomnia", "frisk");
                });
            });
        });

        describe("onBlock()", function()
        {
            /** Initializes the onBlock parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onBlock);

            // can have voltabsorb
            const lanturn: events.SwitchOptions =
            {
                species: "lanturn", level: 50, gender: "M", hp: 100, hpMax: 100
            };

            it("Should reject if move user ignores abilities", async function()
            {
                const mon = sh.initActive("them", lanturn);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("voltabsorb", "illuminate");

                sh.initActive("us").setAbility("moldbreaker");
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.thunderbolt), userRef: "us"});
                await ph.return({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("voltabsorb", "illuminate");
            });

            it("Should infer no on-block ability if it did not activate",
            async function()
            {
                const mon = sh.initActive("them", lanturn);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("voltabsorb", "illuminate");

                sh.initActive("us");
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.thunderbolt), userRef: "us"});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("illuminate");
            });

            it("Should narrow hiddenpower type if ability didn't activate",
            async function()
            {
                // defender immune to electric through an ability
                const mon = sh.initActive("them", lanturn);
                mon.setAbility("voltabsorb");

                // hpType could be electric
                const {hpType} = sh.initActive("us");
                expect(hpType.definiteValue).to.be.null;
                expect(hpType.possibleValues).to.include("electric");

                // ability didn't activate, so hpType must not be electric
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.hiddenpower), userRef: "us"});
                await ph.halt({results: []});
                expect(hpType.possibleValues).to.not.include("electric");
            });

            it("Should infer judgment plate type if ability didn't activate",
                async function()
            {
                // defender immune to electric through an ability
                const mon = sh.initActive("them", lanturn);
                mon.setAbility("voltabsorb");

                // plateType could be electric
                const {item} = sh.initActive("us");
                expect(item.definiteValue).to.be.null;
                expect(item.possibleValues).to.include("zapplate"); // electric

                // ability didn't activate, so plateType must not be electric
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.judgment), userRef: "us"});
                await ph.halt({results: []});
                expect(item.possibleValues).to.not.include("zapplate");
            });

            // TODO: add separate test suites for each dex entry
            describe("block.status = SunnyDay (leafguard)", function()
            {
                let mon: Pokemon;
                beforeEach("Initialize pokemon", function()
                {
                    mon = sh.initActive("them");
                    mon.setAbility("leafguard");
                    sh.initActive("us");
                });

                it("Should block yawn if sun", async function()
                {
                    state.status.weather.start(/*source*/ null,
                        "SunnyDay");
                    pctx = init({them: true},
                        {move: dex.getMove(dex.moves.yawn), userRef: "us"});
                    await ph.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "leafguard"
                    });
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt(
                        {results: [{blockStatus: {yawn: true}}]});
                });

                it("Should not block yawn without sun", async function()
                {
                    pctx = init({them: true},
                        {move: dex.getMove(dex.moves.yawn), userRef: "us"});
                    await ph.halt({results: []});
                    // shouldn't overnarrow
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("leafguard");
                });

                it("Should silently block major status on sun", async function()
                {
                    state.status.weather.start(/*source*/ null,
                        "SunnyDay");
                    pctx = init({them: true},
                        {move: dex.getMove(dex.moves.toxic), userRef: "us"});
                    await ph.halt({results: []});
                    // shouldn't overnarrow
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("leafguard");
                });
            });

            describe("block.move.type = nonSuper (wonderguard)", function()
            {
                it("Should block move", async function()
                {
                    const mon = sh.initActive("them");
                    mon.setAbility("wonderguard", "waterabsorb");
                    sh.initActive("us");
                    pctx = init({them: true},
                        {move: dex.getMove(dex.moves.bubble), userRef: "us"});
                    await ph.handle(
                    {
                        type: "activateAbility", monRef: "them",
                        ability: "wonderguard"
                    });
                    await ph.handle({type: "immune", monRef: "them"});
                    await ph.halt({results: [{immune: true}]});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("wonderguard");
                });
            });
        });

        describe("onTryUnboost()", function()
        {
            /** Initializes the onTryUnboost parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onTryUnboost);

            it("Should reject if move user ignores abilities", async function()
            {
                const mon = sh.initActive("them", tentacruel);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody", "liquidooze");

                sh.initActive("us").setAbility("moldbreaker");
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.charm), userRef: "us"});
                await ph.return({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody", "liquidooze");
            });

            it("Should infer no on-tryUnboost ability if it did not activate",
            async function()
            {
                const mon = sh.initActive("them", tentacruel);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody", "liquidooze");

                sh.initActive("us");
                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.charm), userRef: "us"});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("liquidooze");
            });
        });

        describe("onStatus()", function()
        {
            /** Initializes the onStatus parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onStatus);

            it("Should infer no on-status ability if it did not activate",
            async function()
            {
                const mon = sh.initActive("them", glameow);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("limber", "owntempo");
                mon.volatile.confusion.start();

                pctx = init({them: true}, "confusion",
                    {move: dex.getMove(dex.moves.confuseray), userRef: "us"});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("limber");
            });
        });

        describe("onMoveDamage()", function()
        {
            /** Initializes the onMoveDamage parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onMoveDamage);

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
                    const mon = sh.initActive("them", drifblim);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("aftermath", "unburden");

                    pctx = init({them: true}, "contactKO",
                        {move: dex.getMove(dex.moves.tackle), userRef: "us"});
                    await ph.halt({results: []});
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("unburden");
                });
            });

            describe("qualifier=contact", function()
            {
                it("Should infer no on-moveContact ability if it did not " +
                    "activate", async function()
                {
                    const mon = sh.initActive("them", sharpedo);
                    expect(mon.traits.ability.possibleValues)
                        .to.have.keys("roughskin");

                    pctx = init({them: true}, "contact",
                        {move: dex.getMove(dex.moves.tackle), userRef: "us"});
                    await ph.haltError(Error,
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
                        sh.initActive("us", kecleon);
                        sh.initActive("them");
                        pctx = init({us: true}, "damage",
                        {
                            move: dex.getMove(dex.moves.watergun),
                            userRef: "them"
                        });
                        await ph.handle(
                        {
                            type: "activateAbility", monRef: "us",
                            ability: "colorchange"
                        });
                        await ph.handle(
                        {
                            type: "changeType", monRef: "us",
                            newTypes: ["water", "???"]
                        });
                        await ph.halt({results: [{}]});
                    });

                    it("Should not activate if KO'd", async function()
                    {
                        const mon = sh.initActive("us", kecleon);
                        mon.faint();
                        sh.initActive("them");
                        pctx = init({us: true}, "damage",
                        {
                            move: dex.getMove(dex.moves.watergun),
                            userRef: "them"
                        });
                        await ph.halt({results: []});
                    });

                    it("Should not activate if same type", async function()
                    {
                        const mon = sh.initActive("us", kecleon);
                        mon.volatile.changeTypes(["fire", "???"]);
                        sh.initActive("them");
                        pctx = init({us: true}, "damage",
                        {
                            move: dex.getMove(dex.moves.ember), userRef: "them"
                        });
                        await ph.halt(
                            {results: []});
                    });

                    it("Should infer hiddenpower type if ability didn't " +
                        "activate", async function()
                    {
                        const mon = sh.initActive("us", kecleon);
                        mon.volatile.changeTypes(["ghost", "???"]);
                        const {hpType} = sh.initActive("them");
                        expect(hpType.definiteValue).to.be.null;

                        pctx = init({us: true}, "damage",
                        {
                            move: dex.getMove(dex.moves.hiddenpower),
                            userRef: "them"
                        });
                        await ph.halt({results: []});
                        expect(hpType.definiteValue).to.equal("ghost");
                    });

                    it("Should infer judgment plate type if ability didn't " +
                        "activate", async function()
                    {
                        const mon = sh.initActive("us", kecleon);
                        mon.volatile.changeTypes(["electric", "???"]);
                        const {item} = sh.initActive("them");
                        expect(item.definiteValue).to.be.null;

                        pctx = init({us: true}, "damage",
                        {
                            move: dex.getMove(dex.moves.judgment),
                            userRef: "them"
                        });
                        await ph.halt({results: []});
                        // electric plate
                        expect(item.definiteValue).to.equal("zapplate");
                    });
                });
            });
        });

        describe("onMoveDrain()", function()
        {
            /** Initializes the onMoveDrain parser. */
            const init = setupSubParserPartial(ictx.startArgs, getState,
                ability.onMoveDrain);

            it("Should infer no on-moveDrain ability if it did not activate",
            async function()
            {
                const mon = sh.initActive("them", tentacruel);
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody", "liquidooze");

                pctx = init({them: true},
                    {move: dex.getMove(dex.moves.absorb), userRef: "us"});
                await ph.halt({results: []});
                expect(mon.traits.ability.possibleValues)
                    .to.have.keys("clearbody");
            });
        });

    });
}
