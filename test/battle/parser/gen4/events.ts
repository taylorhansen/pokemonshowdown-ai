import { expect } from "chai";
import "mocha";
import * as dexutil from "../../../../src/battle/dex/dex-util";
import * as events from "../../../../src/battle/parser/BattleEvent";
import { BattleState } from "../../../../src/battle/state/BattleState";
import { ReadonlyTeam } from "../../../../src/battle/state/Team";
import { ReadonlyTeamStatus } from "../../../../src/battle/state/TeamStatus";
import { ReadonlyVolatileStatus } from
    "../../../../src/battle/state/VolatileStatus";
import { Logger } from "../../../../src/Logger";
import { ditto, smeargle } from "../../../helpers/switchOptions";
import { testActivateAbility } from "./activateAbility";
import { testActivateItem } from "./activateItem";
import { InitialContext, ParserContext } from "./Context";
import { testHalt } from "./halt";
import { initParser, ParserHelpers, StateHelpers } from "./helpers";
import { testRemoveItem } from "./removeItem";
import { testSwitchIn } from "./switchIn";
import { testUseMove } from "./useMove";

export function testEvents()
{
    //#region initial context

    async function defaultAgent()
    { throw new Error("BattleAgent expected to not be called"); }
    // suppress logs
    // TODO: should logs be tested?
    const defaultLogger = Logger.null;
    async function defaultSender()
    { throw new Error("ChoiceSender expected to not be called"); }
    const ictx: InitialContext =
    {
        startArgs:
        {
            // use a level of indirection so agent/sender can be modified
            agent: (s, choices) => ictx.agent(s, choices),
            logger: new Logger(msg => ictx.logger.debug(msg),
                msg => ictx.logger.error(msg)),
            sender: choices => ictx.sender(choices)
        },
        agent: defaultAgent, logger: defaultLogger, sender: defaultSender
    };

    beforeEach("Reset InitialContext", function()
    {
        ictx.agent = defaultAgent;
        ictx.logger = defaultLogger;
        ictx.sender = defaultSender;
    });

    //#endregion

    //#region battle state

    /**
     * BattleState for use in `setupSubParserPartial()`. Should not be
     * reassigned.
     */
    let state: BattleState;
    const sh = new StateHelpers(() => state);

    beforeEach("Initialize BattleState", function()
    {
        state = new BattleState();
    });

    //#endregion

    //#region default parser context

    let pctx: ParserContext;
    const ph = new ParserHelpers(() => pctx, getState);

    beforeEach("Initialize default BattleParser", async function()
    {
        pctx = initParser(ictx.startArgs, state);
    });

    afterEach("Close SubParser", async function()
    {
        await ph.close();
    });

    //#endregion

    function getState() { return state; }

    describe("activateAbility", function()
    {
        testActivateAbility(ictx, getState, sh);
    });

    describe("activateFieldEffect", function()
    {
        function test(name: string,
            effect: Exclude<dexutil.FieldEffectType, dexutil.WeatherType>)
        {
            it(`Should activate ${name}`, async function()
            {
                expect(state.status[effect].isActive).to.be.false;

                // start the effect
                await ph.handle(
                    {type: "activateFieldEffect", effect, start: true});
                expect(state.status[effect].isActive).to.be.true;

                // end the effect
                await ph.handle(
                    {type: "activateFieldEffect", effect, start: false});
                expect(state.status[effect].isActive).to.be.false;
            });
        }

        // pseudo-weathers
        test("Gravity", "gravity");
        test("Trick Room", "trickRoom");

        describe("weather", function()
        {
            it("Should set weather", async function()
            {
                await ph.handle(
                {
                    type: "activateFieldEffect", effect: "Sandstorm",
                    start: true
                });
                expect(state.status.weather.type).to.equal("Sandstorm");
                expect(state.status.weather.duration).to.not.be.null;
                expect(state.status.weather.source).to.be.null;
            });
        });
    });

    describe("activateItem", function()
    {
        testActivateItem(ictx, getState, sh);
    });

    describe("activateStatusEffect", function()
    {
        function test(name: string, effect: dexutil.StatusType,
            getter: (v: ReadonlyVolatileStatus) => boolean)
        {
            it(`Should activate ${name}`, async function()
            {
                const v = sh.initActive("us").volatile;
                expect(getter(v)).to.be.false;

                // start the status
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect,
                    start: true
                });
                expect(getter(v)).to.be.true;

                // end the status
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us", effect,
                    start: false
                });
                expect(getter(v)).to.be.false;
            });
        }

        test("Aqua Ring", "aquaRing", v => v.aquaRing);
        test("Attract", "attract", v => v.attract);
        test("Bide", "bide", v => v.bide.isActive);
        test("confusion", "confusion", v => v.confusion.isActive);
        test("Charge", "charge", v => v.charge.isActive);
        test("Curse", "curse", v => v.curse);
        test("Embargo", "embargo", v => v.embargo.isActive);
        // separate test case for encore
        it("Should activate Encore", async function()
        {
            const v = sh.initActive("us").volatile;
            expect(v.encore.move).to.be.null;
            expect(v.encore.ts.isActive).to.be.false;

            // have to set lastMove first
            await ph.rejectError(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "encore", start: true
                },
                Error, "Can't Encore if lastMove is null");
            expect(v.encore.move).to.be.null;
            expect(v.encore.ts.isActive).to.be.false;

            // re-init parser after throw
            await ph.close();
            pctx = initParser(ictx.startArgs, state);

            // set lastMove
            v.lastMove = "splash";

            // start the status
            await ph.handle(
            {
                type: "activateStatusEffect", monRef: "us",
                effect: "encore", start: true
            });
            expect(v.encore.move).to.equal("splash");
            expect(v.encore.ts.isActive).to.be.true;

            // end the status
            await ph.handle(
            {
                type: "activateStatusEffect", monRef: "us",
                effect: "encore", start: false
            });
            expect(v.encore.move).to.be.null;
            expect(v.encore.ts.isActive).to.be.false;
        });
        test("Flash Fire", "flashFire", v => v.flashFire);
        test("Focus Energy", "focusEnergy", v => v.focusEnergy);
        test("Foresight", "foresight", v => v.identified === "foresight");
        test("Heal Block", "healBlock", v => v.healBlock.isActive);
        test("Imprison", "imprison", v => v.imprison);
        test("Ingrain", "ingrain", v => v.ingrain);
        test("Leech Seed", "leechSeed", v => v.leechSeed);
        test("Magnete Rise", "magnetRise", v => v.magnetRise.isActive);
        test("Miracle Eye", "miracleEye",
            v => v.identified === "miracleEye");
        test("Mud Sport", "mudSport", v => v.mudSport);
        test("Nightmare", "nightmare", v => v.nightmare);
        test("Power Trick", "powerTrick", v => v.powerTrick);
        test("Substitute", "substitute", v => v.substitute);
        test("suppress ability", "suppressAbility", v => v.suppressAbility);
        test("Slow Start", "slowStart", v => v.slowStart.isActive);
        test("Taunt", "taunt", v => v.taunt.isActive);
        test("Torment", "torment", v => v.torment);
        test("Uproar", "uproar", v => v.uproar.isActive);
        test("Water Sport", "waterSport", v => v.waterSport);
        test("Yawn", "yawn", v => v.yawn.isActive);

        // singlemove
        test("Destiny Bond", "destinyBond", v => v.destinyBond);
        test("Grudge", "grudge", v => v.grudge);
        test("Rage", "rage", v => v.rage);

        // singleturn
        test("Focus Punch", "focus", v => v.focus);
        test("Endure", "endure", v => v.stallTurns > 0);
        test("Magic Coat", "magicCoat", v => v.magicCoat);
        test("Protect", "protect", v => v.stallTurns > 0);
        test("Roost", "roost", v => v.roost);
        test("Snatch", "snatch", v => v.snatch);

        it("Should throw if invalid status", async function()
        {
            // the type system should guarantee that StateDriver handles
            //  all StatusEffectTypes, so we need to pass in an invalid one
            //  through an any assertion
            await ph.rejectError(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "invalid" as any, start: true
                },
                Error, "Invalid status effect 'invalid'");
        });

        describe("major status", function()
        {
            it("Should afflict major status", async function()
            {
                const mon = sh.initActive("us");
                mon.majorStatus.afflict("brn"); // should make no difference

                // start the status
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "slp", start: true
                });
                expect(mon.majorStatus.current).to.equal("slp");

                // end the status
                await ph.handle(
                {
                    type: "activateStatusEffect", monRef: "us",
                    effect: "slp", start: false
                });
                expect(mon.majorStatus.current).to.be.null;
            });

            it("Should throw if curing but mentioned an unrelated status",
            async function()
            {
                const mon = sh.initActive("us");
                mon.majorStatus.afflict("frz");

                await ph.rejectError(
                    {
                        type: "activateStatusEffect", monRef: "us",
                        effect: "brn", start: false
                    },
                    Error, "MajorStatus 'frz' was expected to be 'brn'");
                expect(mon.majorStatus.current).to.equal("frz");
            });
        });
    });

    describe("activateTeamEffect", function()
    {
        function testItemEffect(name: string,
            effect: "lightScreen" | "reflect")
        {
            it(`Should activate ${name}`, async function()
            {
                const team = state.teams.them;
                expect(team.status[effect].isActive).to.be.false;

                // start the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "them",
                    effect, start: true
                });
                expect(team.status[effect].isActive).to.be.true;
                expect(team.status[effect].source).to.be.null;

                // end the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "them",
                    effect, start: false
                });
                expect(team.status[effect].isActive).to.be.false;
            });
        }

        testItemEffect("Light Screen", "lightScreen");
        testItemEffect("Reflect", "reflect");

        function testHazard(name: string,
            effect: "spikes" | "stealthRock" | "toxicSpikes")
        {
            it(`Should activate ${name}`, async function()
            {
                const team = state.teams.us;
                expect(team.status[effect]).to.equal(0);

                // start the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "us", effect,
                    start: true
                });
                expect(team.status[effect]).to.equal(1);

                // end the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "us", effect,
                    start: false
                });
                expect(team.status[effect]).to.equal(0);
            });
        }

        testHazard("Spikes", "spikes");
        testHazard("Stealth Rock", "stealthRock");
        testHazard("Toxic Spikes", "toxicSpikes");

        function testEffect(name: string,
            effect: dexutil.TeamEffectType | dexutil.ImplicitTeamEffectType,
            getter: (ts: ReadonlyTeamStatus) => boolean)
        {
            it(`Should activate ${name}`, async function()
            {
                const ts = state.teams.us.status;
                expect(getter(ts)).to.be.false;

                // start the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "us", effect,
                    start: true
                });
                expect(getter(ts)).to.be.true;

                // end the effect
                await ph.handle(
                {
                    type: "activateTeamEffect", teamRef: "us", effect,
                    start: false
                });
                expect(getter(ts)).to.be.false;
            });
        }

        testEffect("Healing Wish", "healingWish", ts => ts.healingWish);
        testEffect("Lucky Chant", "luckyChant",
            ts => ts.luckyChant.isActive);
        testEffect("Lunar Dance", "lunarDance", ts => ts.lunarDance);
        testEffect("Mist", "mist", ts => ts.mist.isActive);
        testEffect("Safeguard", "safeguard", ts => ts.safeguard.isActive);
        testEffect("Tailwind", "tailwind", ts => ts.tailwind.isActive);
        testEffect("Wish", "wish", ts => ts.wish.isActive);
    });

    describe("block", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "block", monRef: "us", effect: "protect"});
        });

        describe("Substitute", function()
        {
            it("Should do nothing if mentioned Pokemon has a Substitute",
            async function()
            {
                sh.initActive("us").volatile.substitute = true;
                await ph.handle(
                    {type: "block", monRef: "us", effect: "substitute"});
            });

            it("Should throw if mentioned Pokemon doesn't have a Substitute",
            async function()
            {
                sh.initActive("us");
                await ph.rejectError(
                    {type: "block", monRef: "us", effect: "substitute"}, Error,
                    "Substitute blocked an effect but no Substitute exists");
            });
        });
    });

    describe("boost", function()
    {
        it("Should add boost", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.atk = 1;
            await ph.handle(
                {type: "boost", monRef: "us", stat: "atk", amount: 2});
            expect(boosts.atk).to.equal(3);
        });

        it("Should subtract boost", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.spe = 6;
            await ph.handle(
                {type: "boost", monRef: "us", stat: "spe", amount: -2});
            expect(boosts.spe).to.equal(4);
        });

        it("Should set boost", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.evasion = -2;
            await ph.handle(
            {
                type: "boost", monRef: "us", stat: "evasion", amount: 4,
                set: true
            });
            expect(boosts.evasion).to.equal(4);
        });
    });

    describe("changeType", function()
    {
        it("Should change types", async function()
        {
            const mon = sh.initActive("us");
            const newTypes: [dexutil.Type, dexutil.Type] =
                ["bug", "dragon"];
            await ph.handle(
                {type: "changeType", monRef: "us", newTypes});
            expect(mon.types).to.deep.equal(newTypes);
        });

        it("Should also reset third type", async function()
        {
            const mon = sh.initActive("us");
            mon.volatile.addedType = "ghost";

            await ph.handle(
                {type: "changeType", monRef: "us", newTypes: ["fire", "???"]});
            expect(mon.volatile.addedType).to.equal("???");
        });
    });

    describe("clearAllBoosts", function()
    {
        it("Should clear all boosts from both sides", async function()
        {
            const us = sh.initActive("us").volatile.boosts;
            const them = sh.initActive("them").volatile.boosts;
            us.accuracy = 2;
            them.spe = -2;

            await ph.handle({type: "clearAllBoosts"});
            expect(us.accuracy).to.equal(0);
            expect(them.spe).to.equal(0);
        });
    });

    describe("clearNegativeBoosts", function()
    {
        it("Should clear negative boosts", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.evasion = 2;
            boosts.spa = -3;

            await ph.handle(
                {type: "clearNegativeBoosts", monRef: "us"});
            expect(boosts.evasion).to.equal(2);
            expect(boosts.spa).to.equal(0);
        });
    });

    describe("clearPositiveBoosts", function()
    {
        it("Should clear negative boosts", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.spd = 3;
            boosts.def = -1;

            await ph.handle(
                {type: "clearPositiveBoosts", monRef: "us"});

            expect(boosts.spd).to.equal(0);
            expect(boosts.def).to.equal(-1);
        });
    });

    describe("copyBoosts", function()
    {
        it("Should copy boosts", async function()
        {
            const us = sh.initActive("us").volatile.boosts;
            const them = sh.initActive("them").volatile.boosts;
            us.atk = 2;
            them.atk = -2;

            await ph.handle(
                {type: "copyBoosts", from: "us", to: "them"});
            expect(us.atk).to.equal(2);
            expect(them.atk).to.equal(2);
        });
    });

    describe("countStatusEffect", function()
    {
        function test(name: string,
            effect: dexutil.CountableStatusType): void
        {
            it(`Should update ${name} count`, async function()
            {
                const v = sh.initActive("us").volatile;
                v[effect] = 1;
                await ph.handle(
                {
                    type: "countStatusEffect", monRef: "us", effect,
                    amount: 2
                });
                expect(v[effect]).to.equal(2);
            });
        }

        test("Perish Song", "perish");
        test("Stockpile", "stockpile");
    });

    describe("crit", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "crit", monRef: "us"});
        });
    });

    describe("cureTeam", function()
    {
        it("Should cure team", async function()
        {
            state.teams.them.size = 2;
            const [mon1, mon2] = sh.initTeam("them", [smeargle, ditto]);
            mon1.majorStatus.afflict("slp");
            mon2.majorStatus.afflict("frz");

            expect(mon1.majorStatus.current).to.equal("slp");
            expect(mon2.majorStatus.current).to.equal("frz");
            await ph.handle({type: "cureTeam", teamRef: "them"});
            expect(mon1.majorStatus.current).to.be.null;
            expect(mon2.majorStatus.current).to.be.null;
        });
    });

    describe("disableMove", function()
    {
        it("Should disable move", async function()
        {
            const mon = sh.initActive("them");
            await ph.handle(
                {type: "disableMove", monRef: "them", move: "tackle"});
            expect(mon.volatile.disabled.move).to.equal("tackle");
            expect(mon.volatile.disabled.ts.isActive).to.be.true;
        });
    });

    describe("fail", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "fail"});
        });
    });

    describe("faint", function()
    {
        it("Should faint pokemon", async function()
        {
            const mon = sh.initActive("us");
            await ph.handle({type: "faint", monRef: "us"});
            expect(mon.fainted).to.be.true;
        });
    });

    describe("fatigue", function()
    {
        it("Should reset lockedMove status", async function()
        {
            const v = sh.initActive("them").volatile;
            v.lockedMove.start("outrage");
            await ph.handle({type: "fatigue", monRef: "them"});
            expect(v.lockedMove.isActive).to.be.false;
        });
    });

    describe("feint", function()
    {
        it("Should break stall", async function()
        {
            const v = sh.initActive("them").volatile;
            v.stall(true);
            expect(v.stalling).to.be.true;
            expect(v.stallTurns).to.equal(1);

            // assume "us" uses Feint
            await ph.handle({type: "feint", monRef: "them"});
            expect(v.stalling).to.be.false;
            // should not reset stall turns
            expect(v.stallTurns).to.equal(1);
        });
    });

    describe("formChange", function()
    {
        it("Should change form", async function()
        {
            const mon = sh.initActive("us", smeargle);
            expect(mon.species).to.equal("smeargle");

            await ph.handle(
            {
                type: "formChange", monRef: "us", species: "gyarados",
                // TODO: (how) would hp/level change?
                gender: "M", level: 100, hp: 300, hpMax: 300, perm: false
            });

            expect(mon.species).to.equal("gyarados");
        });
    });

    describe("futureMove", function()
    {
        it("Should prepare and release future move", async function()
        {
            const ts = state.teams.us.status;
            // prepare the move, mentioning the user
            await ph.handle(
            {
                type: "futureMove", monRef: "us", move: "doomdesire",
                start: true
            });
            expect(ts.futureMoves.doomdesire.isActive).to.be.true;

            // release the move, mentioning the target
            await ph.handle(
            {
                type: "futureMove", monRef: "them", move: "doomdesire",
                start: false
            });
            expect(ts.futureMoves.futuresight.isActive).to.be.false;
        });
    });

    describe("halt", function()
    {
        testHalt(ictx, getState, sh, () => pctx, ph);
    });

    describe("hitCount", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "hitCount", monRef: "us", count: 4});
        });
    });

    describe("immune", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "immune", monRef: "them"});
        });
    });

    describe("inactive", function()
    {
        it("Should reset single-move statuses as if a move was attempted",
        async function()
        {
            const v = sh.initActive("us").volatile;
            v.destinyBond = true;

            await ph.handle({type: "inactive", monRef: "us"});
            expect(v.destinyBond).to.be.false;
        });

        it("Should reveal move if provided", async function()
        {
            const moveset = sh.initActive("them").moveset;
            expect(moveset.get("splash")).to.be.null;

            await ph.handle({type: "inactive", monRef: "them", move: "splash"});
            expect(moveset.get("splash")).to.not.be.null;
        });

        it("Should reveal move for both sides if imprison", async function()
        {
            const us = sh.initActive("us").moveset;
            const them = sh.initActive("them").moveset;
            expect(us.get("splash")).to.be.null;
            expect(them.get("splash")).to.be.null;

            await ph.handle(
            {
                type: "inactive", monRef: "them", reason: "imprison",
                move: "splash"
            });
            expect(us.get("splash")).to.not.be.null;
            expect(them.get("splash")).to.not.be.null;
        });

        it("Should consume recharge turn", async function()
        {
            const v = sh.initActive("us").volatile;
            v.mustRecharge = true;

            await ph.handle(
                {type: "inactive", monRef: "us", reason: "recharge"});
            expect(v.mustRecharge).to.be.false;
        });

        it("Should tick sleep counter", async function()
        {
            const ms = sh.initActive("us").majorStatus;
            ms.afflict("slp");
            expect(ms.current).to.equal("slp");
            expect(ms.turns).to.equal(1);

            await ph.handle({type: "inactive", monRef: "us", reason: "slp"});
            expect(ms.turns).to.equal(2);
        });

        describe("Truant ability", function()
        {
            it("Should flip Truant state", async function()
            {
                // first make sure the pokemon has truant
                const mon = sh.initActive("us");
                mon.setAbility("truant");
                expect(mon.volatile.willTruant).to.be.false;

                // also flipped back on postTurn to sync with this event
                await ph.handle(
                    {type: "inactive", monRef: "us", reason: "truant"});
                expect(mon.volatile.willTruant).to.be.true;
            });

            it("Should overlap truant turn with recharge turn", async function()
            {
                // first make sure the pokemon has truant
                const mon = sh.initActive("us");
                mon.setAbility("truant");
                expect(mon.volatile.willTruant).to.be.false;

                // indicate that the next turn is a recharge turn
                mon.volatile.mustRecharge = true;

                await ph.handle(
                    {type: "inactive", monRef: "us", reason: "truant"});
                expect(mon.volatile.willTruant).to.be.true;
                expect(mon.volatile.mustRecharge).to.be.false;
            });
        });

        describe("initOtherTeamSize", function()
        {
            it("Should init other team's size", async function()
            {
                await ph.handle({type: "initOtherTeamSize", size: 2});
                expect(state.teams.them.size).to.equal(2);
            });
        });

        describe("initTeam", function()
        {
            /** Base InitTeam event for testing. */
            const initTeamEvent: events.InitTeam =
            {
                type: "initTeam",
                team:
                [
                    {
                        species: "smeargle", level: 50, gender: "F",
                        hp: 115, hpMax: 115,
                        stats:
                        {
                            atk: 25, def: 40, spa: 25, spd: 50, spe: 80
                        },
                        moves: ["splash", "tackle"],
                        baseAbility: "technician", item: "lifeorb"
                    }
                ]
            };
            function checkInitTeam(team: ReadonlyTeam, event: events.InitTeam):
                void
            {
                expect(team.size).to.equal(event.team.length);

                for (const data of event.team)
                {
                    const mon = team.pokemon.find(
                        p => !!p && p.species === data.species)!;
                    expect(mon).to.exist;

                    expect(mon.species).to.equal(data.species);
                    expect(mon.traits.stats.level).to.equal(data.level);
                    expect(mon.item.definiteValue).to.equal(data.item);
                    expect(mon.traits.ability.definiteValue)
                        .to.equal(data.baseAbility);

                    // check stats
                    // first check hp
                    const table = mon.traits.stats;
                    expect(table.hp.hp).to.be.true;
                    expect(table.hp.min).to.equal(data.hpMax);
                    expect(table.hp.max).to.equal(data.hpMax);
                    expect(mon.hp.current).to.equal(data.hp);
                    expect(mon.hp.max).to.equal(data.hpMax);
                    // then check other stats
                    for (const stat of Object.keys(dexutil.statsExceptHP) as
                        dexutil.StatExceptHP[])
                    {
                        expect(table[stat].hp).to.be.false;
                        expect(table[stat].min).to.equal(data.stats[stat]);
                        expect(table[stat].max).to.equal(data.stats[stat]);
                    }

                    // check moves
                    expect(mon.moveset.moves)
                        .to.have.lengthOf(data.moves.length);
                    for (const name of data.moves)
                    {
                        const move = mon.moveset.get(name);
                        expect(move).to.not.be.null;
                        expect(move!.name).to.equal(name);
                    }

                    // check optional data

                    if (data.hpType)
                    {
                        expect(mon.hpType.definiteValue)
                            .to.equal(data.hpType);
                    }
                    else expect(mon.hpType.definiteValue).to.be.null;

                    if (data.happiness)
                    {
                        expect(mon.happiness).to.equal(data.happiness);
                    }
                    else expect(mon.happiness).to.be.null;
                }
            }

            it("Should init our team", async function()
            {
                await ph.handle(initTeamEvent);
                checkInitTeam(state.teams.us, initTeamEvent);
            });

            it("Should init our team with hp type and happiness",
            async function()
            {
                const event: events.InitTeam =
                {
                    ...initTeamEvent,
                    team:
                    [
                        {
                            ...initTeamEvent.team[0], hpType: "fire",
                            happiness: 255
                        },
                        ...initTeamEvent.team.slice(1)
                    ]
                };
                await ph.handle(event);
                checkInitTeam(state.teams.us, event);
            });
        });
    });

    describe("invertBoosts", function()
    {
        it("Should invert boosts", async function()
        {
            const {boosts} = sh.initActive("us").volatile;
            boosts.spe = 1;
            boosts.atk = -1;

            await ph.handle({type: "invertBoosts", monRef: "us"});
            expect(boosts.spe).to.equal(-1);
            expect(boosts.atk).to.equal(1);
        });
    });

    describe("lockOn", function()
    {
        it("Should set Lock-On status", async function()
        {
            const us = sh.initActive("us").volatile;
            const them = sh.initActive("them").volatile;
            expect(us.lockedOnBy).to.be.null;
            expect(us.lockOnTarget).to.be.null;
            expect(us.lockOnTurns.isActive).to.be.false;
            expect(them.lockedOnBy).to.be.null;
            expect(them.lockOnTarget).to.be.null;
            expect(them.lockOnTurns.isActive).to.be.false;

            await ph.handle({type: "lockOn", monRef: "us", target: "them"});
            expect(us.lockedOnBy).to.be.null;
            expect(us.lockOnTarget).to.equal(them);
            expect(us.lockOnTurns.isActive).to.be.true;
            expect(them.lockedOnBy).to.equal(us);
            expect(them.lockOnTarget).to.be.null;
            expect(them.lockOnTurns.isActive).to.be.false;
        });
    });

    describe("mimic", function()
    {
        it("Should Mimic move", async function()
        {
            const mon = sh.initActive("them");
            mon.moveset.reveal("mimic");

            await ph.handle({type: "mimic", monRef: "them", move: "splash"});
            expect(mon.moveset.get("splash")).to.not.be.null;
            expect(mon.moveset.get("mimic")).to.be.null;
            expect(mon.baseMoveset.get("splash")).to.be.null;
            expect(mon.baseMoveset.get("mimic")).to.not.be.null;
        });
    });

    describe("miss", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "miss", monRef: "them"});
        });
    });

    describe("modifyPP", function()
    {
        it("Should modify pp amount of move", async function()
        {
            const {moveset} = sh.initActive("them");

            await ph.handle(
                {type: "modifyPP", monRef: "them", move: "splash", amount: -4});
            const move = moveset.get("splash");
            expect(move).to.not.be.null;
            expect(move!.pp).to.equal(60);
            expect(move!.maxpp).to.equal(64);

            await ph.handle(
                {type: "modifyPP", monRef: "them", move: "splash", amount: 3});
            expect(move!.pp).to.equal(63);
            expect(move!.maxpp).to.equal(64);
        });

        describe("amount=deplete", function()
        {
            it("Should fully deplete pp", async function()
            {
                const {moveset} = sh.initActive("them");
                await ph.handle(
                {
                    type: "modifyPP", monRef: "them", move: "splash",
                    amount: "deplete"
                });

                const move = moveset.get("splash");
                expect(move).to.not.be.null;
                expect(move!.pp).to.equal(0);
                expect(move!.maxpp).to.equal(64);
            });
        });
    });

    describe("mustRecharge", function()
    {
        it("Should indicate recharge", async function()
        {
            const {volatile: v} = sh.initActive("us");
            expect(v.mustRecharge).to.be.false;
            await ph.handle({type: "mustRecharge", monRef: "us"});
            expect(v.mustRecharge).to.be.true;
        });
    });

    describe("noTarget", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "noTarget", monRef: "them"});
        });
    });

    describe("preTurn", function()
    {
        it("TODO"); // mark test as pending
        it("TODO", async function()
        {
            await ph.handle({type: "preTurn"});
        });
    });

    describe("prepareMove", function()
    {
        it("Should prepare two-turn move", async function()
        {
            const vts = sh.initActive("them").volatile.twoTurn;
            await ph.handle({type: "prepareMove", monRef: "them",move: "dive"});
            expect(vts.isActive).to.be.true;
            expect(vts.type).to.equal("dive");
        });
    });

    describe("postTurn", function()
    {
        it("TODO"); // mark test as pending
        it("TODO", async function()
        {
            await ph.handle({type: "postTurn"});
        });
    });

    describe("reenableMoves", function()
    {
        it("Should re-enable disabled moves", async function()
        {
            const v = sh.initActive("them").volatile;
            v.disableMove("tackle");
            expect(v.disabled.move).to.equal("tackle");
            expect(v.disabled.ts.isActive).to.be.true;

            await ph.handle({type: "reenableMoves", monRef: "them"});
            expect(v.disabled.move).to.be.null;
            expect(v.disabled.ts.isActive).to.be.false;
        });
    });

    describe("removeItem", function()
    {
        testRemoveItem(ictx, getState, sh);
    });

    describe("resetWeather", function()
    {
        it("Should reset weather back to normal", async function()
        {
            // modify the weather
            state.status.weather.start(null, "Hail");
            expect(state.status.weather.type).to.equal("Hail");

            // set it back to normal
            await ph.handle({type: "resetWeather"});
            expect(state.status.weather.type).to.equal("none");
        });
    });

    describe("resisted", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "resisted", monRef: "them"});
        });
    });

    describe("restoreMoves", function()
    {
        it("Should restore all move's PP", async function()
        {
            const {moveset} = sh.initActive("them");
            moveset.reveal("splash").pp -= 4;
            moveset.reveal("tackle").pp = 0;

            await ph.handle({type: "restoreMoves", monRef: "them"});

            const splash = moveset.get("splash");
            expect(splash).to.not.be.null;
            expect(splash!.pp).to.equal(splash!.maxpp);

            const tackle = moveset.get("tackle");
            expect(tackle).to.not.be.null;
            expect(tackle!.pp).to.equal(tackle!.maxpp);
        });
    });

    describe("revealItem", function()
    {
        it("Should reveal item", async function()
        {
            const {item} = sh.initActive("them");
            expect(item.definiteValue).to.be.null;

            await ph.handle(
            {
                type: "revealItem", monRef: "them", item: "leftovers",
                gained: false
            });
            expect(item.definiteValue).to.equal("leftovers");
        });
    });

    describe("revealMove", function()
    {
        it("Should reveal move", async function()
        {
            const {moveset} = sh.initActive("them");
            expect(moveset.get("tackle")).to.be.null;

            await ph.handle(
                {type: "revealMove", monRef: "them", move: "tackle"});
            expect(moveset.get("tackle")).to.not.be.null;
        });
    });

    describe("setThirdType", function()
    {
        it("Should set third type", async function()
        {
            const v = sh.initActive("us").volatile;
            await ph.handle(
                {type: "setThirdType", monRef: "us", thirdType: "bug"});
            expect(v.addedType).to.equal("bug");
        });
    });

    describe("sketch", function()
    {
        it("Should Sketch move", async function()
        {
            const mon = sh.initActive("them");
            mon.moveset.reveal("sketch");

            await ph.handle({type: "sketch", monRef: "them", move: "tackle"});
            expect(mon.moveset.get("tackle")).to.not.be.null;
            expect(mon.moveset.get("sketch")).to.be.null;
            expect(mon.baseMoveset.get("tackle")).to.not.be.null;
            expect(mon.baseMoveset.get("sketch")).to.be.null;
        });
    });

    describe("superEffective", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle({type: "superEffective", monRef: "us"});
        });
    });

    describe("swapBoosts", function()
    {
        it("Should swap stat boosts", async function()
        {
            const us = sh.initActive("us").volatile.boosts;
            const them = sh.initActive("them").volatile.boosts;
            us.accuracy = 4;
            them.spd = -1;

            await ph.handle(
            {
                type: "swapBoosts", monRef1: "us", monRef2: "them",
                stats: ["accuracy", "spd"]
            });
            expect(us.accuracy).to.equal(0);
            expect(us.spd).to.equal(-1);
            expect(them.accuracy).to.equal(4);
            expect(them.spd).to.equal(0);
        });
    });

    describe("switchIn", function()
    {
        testSwitchIn(ictx, getState, sh);
    });

    describe("takeDamage", function()
    {
        it("Should change hp", async function()
        {
            const mon = sh.initActive("us", smeargle);
            expect(mon.hp.current).to.equal(smeargle.hp);

            await ph.handle({type: "takeDamage", monRef: "us", hp: 50});
            expect(mon.hp.current).to.equal(50);
        });
    });

    describe("transform", function()
    {
        it("Should transform pokemon", async function()
        {
            const us = sh.initActive("us", smeargle);
            const them = sh.initActive("them", ditto);

            await ph.handle({type: "transform", source: "them", target: "us"});
            expect(them.volatile.transformed).to.be.true;
            expect(them.species).to.equal(us.species);
        });
    });

    describe("trap", function()
    {
        it("Should trap pokemon", async function()
        {
            const us = sh.initActive("us").volatile;
            const them = sh.initActive("them").volatile;

            await ph.handle({type: "trap", target: "us", by: "them"});
            expect(us.trapped).to.equal(them);
            expect(us.trapping).to.be.null;
            expect(them.trapped).to.be.null;
            expect(them.trapping).to.equal(us);
        });
    });

    describe("updateFieldEffect", function()
    {
        it("Should tick weather", async function()
        {
            // first set the weather
            await ph.handle(
            {
                type: "activateFieldEffect", effect: "Sandstorm", start: true
            });
            expect(state.status.weather.turns).to.equal(0);

            await ph.handle({type: "updateFieldEffect", effect: "Sandstorm"});
            expect(state.status.weather.turns).to.equal(1);
        });

        it("Should throw if a different weather is mentioned", async function()
        {
            // first set the weather
            await ph.handle(
            {
                type: "activateFieldEffect", effect: "RainDance",
                start: true
            });
            expect(state.status.weather.turns).to.equal(0);

            await ph.rejectError(
                {type: "updateFieldEffect", effect: "Sandstorm"}, Error,
                "Weather is 'RainDance' but ticked weather is 'Sandstorm'");
            expect(state.status.weather.type).to.equal("RainDance");
            expect(state.status.weather.turns).to.equal(0);
        });
    });

    describe("updateMoves", function()
    {
        it("Should update moves", async function()
        {
            const mon = sh.initActive("us");
            const tackle = mon.moveset.reveal("tackle");
            await ph.handle(
            {
                type: "updateMoves", monRef: "us",
                moves:
                    [{id: "tackle", pp: 2}, {id: "watergun", pp: 5, maxpp: 20}]
            });
            expect(tackle.pp).to.equal(2);
            const watergun = mon.moveset.get("watergun")!;
            expect(watergun).to.not.be.null;
            expect(watergun.pp).to.equal(5);
            expect(watergun.maxpp).to.equal(20);
        });
    });

    describe("updateStatusEffect", function()
    {
        async function test(name: string, effect: dexutil.UpdatableStatusType)
        {
            it(`Should update ${name}`, async function()
            {
                const v = sh.initActive("us").volatile;
                expect(v[effect].isActive).to.be.false;

                // first start the effect
                v[effect].start();
                expect(v[effect].isActive).to.be.true;
                expect(v[effect].turns).to.equal(0);

                // then update it
                await ph.handle(
                    {type: "updateStatusEffect", monRef: "us", effect});
                expect(v[effect].isActive).to.be.true;
                expect(v[effect].turns).to.equal(1);
            });
        }

        test("Bide", "bide");
        test("confusion", "confusion");
        test("Uproar", "uproar");
    });

    describe("useMove", function()
    {
        testUseMove(ictx, getState, sh);
    });
}
