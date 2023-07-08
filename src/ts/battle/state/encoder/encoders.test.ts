import {expect} from "chai";
import "mocha";
import * as dex from "../../dex";
import {Hp} from "../../state/Hp";
import {MajorStatusCounter} from "../../state/MajorStatusCounter";
import {Move} from "../../state/Move";
import {Moveset} from "../../state/Moveset";
import {MultiTempStatus} from "../../state/MultiTempStatus";
import {Pokemon} from "../../state/Pokemon";
import {RoomStatus} from "../../state/RoomStatus";
import {StatRange} from "../../state/StatRange";
import {StatTable} from "../../state/StatTable";
import {TeamStatus} from "../../state/TeamStatus";
import {TempStatus} from "../../state/TempStatus";
import {VolatileStatus} from "../../state/VolatileStatus";
import {setAllVolatiles} from "../../state/VolatileStatus.test";
import {BattleState} from "../BattleState";
import {SwitchOptions} from "../Team";
import {Encoder} from "./Encoder";
import * as encoders from "./encoders";

export const test = () =>
    describe("encoders", function () {
        interface CaseArgs<TState> {
            /** Optional name of the test case. */
            readonly name?: string;
            /** Encoder to use. */
            readonly encoder: Encoder<TState>;
            /** State initializer. */
            readonly init: () => TState;
            /**
             * Values to compare to the encoded values. If omitted, then the
             * encoded values are just checked for `NaN`s and values outside the
             * range `[-1, 1]`.
             */
            values?: Float32Array;
        }

        function testEncoder<TStates extends unknown[]>(
            name: string,
            ...cases: {[T in keyof TStates]: CaseArgs<TStates[T]>}
        ): void {
            describe(name, function () {
                for (let i = 0; i < cases.length; ++i) {
                    const c = cases[i];
                    describe(`Case ${i + 1}${
                        c.name ? ` (${c.name})` : ""
                    }`, function () {
                        let state: unknown;
                        let arr: Float32Array;

                        beforeEach(`Initialize ${name}`, function () {
                            state = c.init();
                            arr = new Float32Array(encoder.size).fill(NaN);
                        });

                        const {encoder, values} = c;
                        if (values) {
                            it(`Should be [${values.join(", ")}]`, function () {
                                expect(encoder.size).to.equal(
                                    values.length,
                                    `Encoder of size ${encoder.size} does ` +
                                        "not match the expected values of " +
                                        `size ${values.length}`,
                                );

                                encoder.encode(arr, state);
                                expect(arr).to.deep.include(values);
                            });
                        } else {
                            it("Should contain only numbers between -1 and 1", function () {
                                encoder.encode(arr, state);
                                for (let j = 0; j < encoder.size; ++j) {
                                    const x = arr[j];
                                    expect(
                                        x,
                                        `Value at index ${j} is NaN or was ` +
                                            "not filled",
                                    ).to.not.be.NaN;
                                    expect(
                                        x >= -1 && x <= 1,
                                        `Value ${x} at index ${j} is out of ` +
                                            "range",
                                    ).to.be.true;
                                }
                            });
                        }
                    });
                }
            });
        }

        const domain = ["a", "b", "c"];
        const unknownKeyEncoder = encoders.unknownKeyEncoder(domain);
        testEncoder(
            "unknownKeyEncoder",
            {
                name: "Unnarrowed",
                encoder: unknownKeyEncoder,
                init: () => domain,
                values: new Float32Array([1 / 3, 1 / 3, 1 / 3]),
            },
            {
                name: "Partially narrowed",
                encoder: unknownKeyEncoder,
                init: () => ["b", "c"],
                values: new Float32Array([0, 1 / 2, 1 / 2]),
            },
            {
                name: "Fully narrowed",
                encoder: unknownKeyEncoder,
                init: () => ["b"],
                values: new Float32Array([0, 1, 0]),
            },
            {
                name: "Overnarrowed",
                encoder: unknownKeyEncoder,
                init: () => [],
                values: new Float32Array([0, 0, 0]),
            },
        );

        testEncoder(
            "TempStatus",
            {
                name: "Unset",
                encoder: encoders.tempStatusEncoder,
                init: () => new TempStatus("x", 3),
                values: new Float32Array([0]),
            },
            {
                name: "Started",
                encoder: encoders.tempStatusEncoder,
                init() {
                    const ts = new TempStatus("x", 3);
                    ts.start();
                    return ts;
                },
                values: new Float32Array([1]),
            },
            {
                name: "Ticked",
                encoder: encoders.tempStatusEncoder,
                init() {
                    const ts = new TempStatus("x", 3);
                    ts.start();
                    ts.tick();
                    return ts;
                },
                values: new Float32Array([2 / 3]),
            },
            {
                name: "Over duration",
                encoder: encoders.tempStatusEncoder,
                init() {
                    const ts = new TempStatus("x", 3);
                    ts.start();
                    ts.tick();
                    ts.tick();
                    expect(() => ts.tick()).to.throw(
                        Error,
                        "TempStatus 'x' lasted longer than expected " +
                            "(3/3 turns)",
                    );
                    return ts;
                },
                values: new Float32Array([0]),
            },
        );

        testEncoder(
            "MultiTempStatus",
            {
                name: "Unset",
                encoder: encoders.multiTempStatusEncoder(["x", "y", "z"]),
                init: () => new MultiTempStatus({x: true, y: true, z: true}, 3),
                values: new Float32Array([0, 0, 0]),
            },
            {
                name: "Started",
                encoder: encoders.multiTempStatusEncoder(["x", "y", "z"]),
                init() {
                    const mts = new MultiTempStatus(
                        {x: true, y: true, z: true},
                        3,
                    );
                    mts.start("y");
                    return mts;
                },
                values: new Float32Array([0, 1, 0]),
            },
            {
                name: "Ticked",
                encoder: encoders.multiTempStatusEncoder(["x", "y", "z"]),
                init() {
                    const mts = new MultiTempStatus(
                        {x: true, y: true, z: true},
                        3,
                    );
                    mts.start("z");
                    mts.tick();
                    return mts;
                },
                values: new Float32Array([0, 0, 2 / 3]),
            },
            {
                name: "Started + Infinite",
                encoder: encoders.multiTempStatusEncoder(["x", "y", "z"]),
                init() {
                    const mts = new MultiTempStatus(
                        {x: true, y: true, z: true},
                        3,
                    );
                    mts.start("x", true /*infinite*/);
                    mts.tick();
                    return mts;
                },
                values: new Float32Array([1, 0, 0]),
            },
        );

        testEncoder("RoomStatus", {
            name: "Unset",
            encoder: encoders.roomStatusEncoder,
            init: () => new RoomStatus(),
        });

        testEncoder("TeamStatus", {
            name: "Unset",
            encoder: encoders.teamStatusEncoder,
            init: () => new TeamStatus(),
        });

        testEncoder(
            "Hp",
            {
                name: "Fully Initialized",
                encoder: encoders.hpEncoder,
                init() {
                    const hp = new Hp();
                    hp.set(50, 100);
                    return hp;
                },
                values: new Float32Array([0.5]),
            },
            {
                name: "Uninitialized",
                encoder: encoders.hpEncoder,
                init: () => new Hp(),
                values: new Float32Array([0]),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownHpEncoder,
                init: () => null,
                values: new Float32Array([1]),
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyHpEncoder,
                init: () => undefined,
                values: new Float32Array([0]),
            },
        );

        testEncoder(
            "MajorStatusCounter",
            {
                name: "Fully Initialized",
                encoder: encoders.definedMajorStatusCounterEncoder,
                init: () => {
                    const msc = new MajorStatusCounter();
                    msc.afflict("slp");
                    return msc;
                },
            },
            {
                name: "No status",
                encoder: encoders.definedMajorStatusCounterEncoder,
                init: () => new MajorStatusCounter(),
                values: new Float32Array(dex.majorStatusKeys.length).fill(0),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownMajorStatusCounterEncoder,
                init: () => null,
                values: new Float32Array(dex.majorStatusKeys.length).fill(0),
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyMajorStatusCounterEncoder,
                init: () => undefined,
                values: new Float32Array(dex.majorStatusKeys.length).fill(0),
            },
        );

        testEncoder(
            "basicEncoder",
            {
                name: "Fully Initialized",
                encoder: encoders.definedBasicEncoder,
                init: () => {
                    const mon = new Pokemon("magikarp", 100, ["splash"], "F");
                    mon.happiness = 128;
                    mon.hp.set(50, 50);
                    return mon;
                },
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownBasicEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyBasicEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "VolatileStatus",
            {
                name: "Fully Initialized",
                encoder: encoders.volatileStatusEncoder,
                init() {
                    const vs = new VolatileStatus();
                    vs.species = "magikarp";
                    vs.stats = StatTable.base(dex.pokemon["magikarp"], 100);
                    return vs;
                },
            },
            {
                name: "Everything Set",
                encoder: encoders.volatileStatusEncoder,
                init() {
                    const v = new VolatileStatus();
                    setAllVolatiles(v);
                    return v;
                },
            },
        );

        testEncoder(
            "speciesEncoder",
            {
                name: "Species",
                encoder: encoders.definedSpeciesEncoder,
                init: () => "magikarp",
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownSpeciesEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptySpeciesEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "typesEncoder",
            {
                name: "Typeless",
                encoder: encoders.typesEncoder,
                init: () => ["???", "???"] as dex.Type[],
                values: new Float32Array(dex.typeKeys.length - 1).fill(0),
            },
            {
                name: "One Type",
                encoder: encoders.typesEncoder,
                init: () => ["fire", "???"] as dex.Type[],
                values: new Float32Array(dex.typeKeys.length - 1)
                    .fill(0)
                    .fill(1, dex.types.fire, dex.types.fire + 1),
            },
            {
                name: "Two Types",
                encoder: encoders.typesEncoder,
                init: () => ["normal", "flying"] as dex.Type[],
                values: new Float32Array(dex.typeKeys.length - 1)
                    .fill(0)
                    .fill(1, dex.types.normal, dex.types.normal + 1)
                    .fill(1, dex.types.flying, dex.types.flying + 1),
            },
        );

        testEncoder(
            "StatRange",
            {
                name: "Fully Initialized",
                encoder: encoders.definedStatRangeEncoder,
                init: () => new StatRange(100, 100, false /*hp*/),
            },
            {
                name: "Fully Initialized + HP",
                encoder: encoders.definedStatRangeEncoder,
                init: () => new StatRange(100, 100, true /*hp*/),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownStatRangeEncoder,
                init: () => null,
                values: new Float32Array([0.5, 0.5, 0.5]),
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyStatRangeEncoder,
                init: () => undefined,
                values: new Float32Array([0, 0, 0]),
            },
        );

        testEncoder(
            "StatTable",
            {
                name: "Fully Initialized",
                encoder: encoders.definedStatTableEncoder,
                init: () => StatTable.base(dex.pokemon["magikarp"], 100),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownStatTableEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyStatTableEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "abilityEncoder",
            {
                name: "Ability",
                encoder: encoders.definedAbilityEncoder,
                init: () => ({ability: ["sturdy", "illuminate"]}),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownAbilityEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyAbilityEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "itemEncoder",
            {
                name: "Item",
                encoder: encoders.definedItemEncoder,
                init: () => ({item: "leftovers", lastItem: "none"}),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownItemEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyItemEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "Move",
            {
                name: "Fully Initialized",
                encoder: encoders.definedMoveEncoder,
                init: () => ({
                    move: new Move("tackle"),
                    volatile: new VolatileStatus(),
                    hpType: null,
                }),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownMoveEncoder,
                init: () => null,
            },
            {
                name: "Unrevealed + Constraint",
                encoder: encoders.constrainedMoveEncoder,
                init: (): encoders.ConstrainedMoveArgs => ({
                    move: "constrained",
                    constraint: new Set(["tackle", "splash"]),
                }),
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyMoveEncoder,
                init: () => undefined,
            },
        );

        testEncoder(
            "Moveset",
            {
                name: "Fully Initialized",
                encoder: encoders.definedMovesetEncoder,
                init: () => ({
                    moveset: new Moveset([
                        "splash",
                        "tackle",
                        "hiddenpower",
                        "return",
                    ]),
                    volatile: new VolatileStatus(),
                    hpType: null,
                }),
            },
            {
                name: "Partially Initialized",
                encoder: encoders.definedMovesetEncoder,
                init() {
                    const moveset = new Moveset(
                        ["splash", "tackle", "metronome", "protect"],
                        3,
                    );
                    moveset.reveal("splash");
                    return {
                        moveset,
                        volatile: new VolatileStatus(),
                        hpType: null,
                    };
                },
            },
            {
                name: "Uninitialized",
                encoder: encoders.definedMovesetEncoder,
                init: () => ({
                    moveset: new Moveset(),
                    volatile: new VolatileStatus(),
                    hpType: null,
                }),
            },
            {
                name: "Unrevealed",
                encoder: encoders.unknownMovesetEncoder,
                init: () => null,
            },
            {
                name: "Nonexistent",
                encoder: encoders.emptyMovesetEncoder,
                init: () => undefined,
            },
        );

        testEncoder("stateEncoder", {
            name: "Fully Initialized",
            encoder: encoders.stateEncoder,
            init: () => {
                const switchOptions: SwitchOptions = {
                    species: "magikarp",
                    level: 100,
                    gender: "M",
                    hp: 200,
                    hpMax: 200,
                };
                const state = new BattleState("username");
                state.ourSide = "p2";
                state.teams.p1!.size = 2;
                state.teams.p1!.switchIn(switchOptions);
                state.teams.p2!.size = 2;
                state.teams.p2!.switchIn(switchOptions);
                return {state};
            },
        });
    });
