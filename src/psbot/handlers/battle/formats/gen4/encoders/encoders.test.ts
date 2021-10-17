import { expect } from "chai";
import "mocha";
import { allocUnsafe } from "../../../../../../buf";
import { Encoder } from "../../../ai/encoder/Encoder";
import { limitedStatusTurns, oneHotEncoder, OneHotEncoderArgs } from
    "../../../ai/encoder/helpers";
import * as dex from "../dex";
import { BattleState } from "../state/BattleState";
import { HP } from "../state/HP";
import { ItemTempStatus } from "../state/ItemTempStatus";
import { MajorStatusCounter } from
    "../state/MajorStatusCounter";
import { Move } from "../state/Move";
import { Moveset } from "../state/Moveset";
import { Pokemon } from "../state/Pokemon";
import { PokemonTraits } from "../state/PokemonTraits";
import { PossibilityClass } from "../state/PossibilityClass";
import { RoomStatus } from "../state/RoomStatus";
import { StatRange } from "../state/StatRange";
import { StatTable } from "../state/StatTable";
import { SwitchOptions, Team } from "../state/Team";
import { TeamStatus } from "../state/TeamStatus";
import { TempStatus } from "../state/TempStatus";
import { VariableTempStatus } from
    "../state/VariableTempStatus";
import { VolatileStatus } from "../state/VolatileStatus";
import { setAllVolatiles } from "../state/VolatileStatus.test";
import * as encoders from "./encoders";

const switchInOptions: SwitchOptions =
    {species: "magikarp", level: 100, gender: "M", hp: 200, hpMax: 200};

/**
 * Allocates an array filled with `NaN`. This is used to test that encoders
 * completely fill in the arrays that they're given.
 * @param size Array size.
 */
function allocNaN(size: number): Float32Array
{
    return allocUnsafe(size).fill(NaN);
}

export const test = () => describe("encoders", function()
{
    describe("oneHot()", function()
    {
        function testOneHot(length: number, args: OneHotEncoderArgs):
            Float32Array
        {
            const encoder = oneHotEncoder(length);
            const arr = allocNaN(encoder.size);
            encoder.encode(arr, args);
            return arr;
        }

        it("Should encode class of values", function()
        {
            expect(testOneHot(3, {id: 1})).to.deep.include([0, 1, 0]);
        });

        it("Should encode class of values with custom 1 and 0 values",
        function()
        {
            expect(testOneHot(3, {id: 1, one: 10, zero: 3}))
                .to.deep.include([3, 10, 3]);
        });

        it("Should fill with 0s if index is null", function()
        {
            expect(testOneHot(3, {id: null})).to.deep.include([0, 0, 0]);
        });
    });

    describe("limitedStatusTurns()", function()
    {
        it("Should return 1 if just started", function()
        {
            expect(limitedStatusTurns(1, 5)).to.equal(1);
        });

        it("Should interpolate status turns", function()
        {
            expect(limitedStatusTurns(2, 5)).to.equal(4 / 5);
            expect(limitedStatusTurns(3, 5)).to.equal(3 / 5);
            expect(limitedStatusTurns(4, 5)).to.equal(2 / 5);
            expect(limitedStatusTurns(5, 5)).to.equal(1 / 5);
        });

        it("Should return 0 if no more turns left", function()
        {
            expect(limitedStatusTurns(6, 5)).to.equal(0);
        });

        it("Should return 0 if over duration", function()
        {
            expect(limitedStatusTurns(7, 5)).to.equal(0);
        });
    });

    interface CaseArgs<TState>
    {
        /** Optional name of the test case. */
        readonly name?: string;
        /** Encoder to use. */
        readonly encoder: Encoder<TState>;
        /** State initializer. */
        init(): TState;
        /** Values to compare to the encoded values. */
        values?: Float32Array;
    }

    function testEncoder<TStates extends any[]>(name: string,
        ...cases: {[T in keyof TStates]: CaseArgs<TStates[T]>}): void
    {
        describe(name, function()
        {
            for (let i = 0; i < cases.length; ++i)
            {
                const c = cases[i];
                describe(`Case ${i + 1}${c.name ? ` (${c.name})` : ""}`,
                function()
                {
                    let state: any;

                    beforeEach(`Initialize ${name}`, function()
                    {
                        state = c.init();
                    });

                    const {encoder, values} = c;
                    if (values)
                    {
                        it(`Should be [${values.join(", ")}]`, function()
                        {
                            expect(encoder.size).to.equal(values.length,
                                `Encoder of size ${encoder.size} does not ` +
                                "match the expected values of size " +
                                values.length);

                            const arr = allocNaN(encoder.size);
                            encoder.encode(arr, state);
                            expect(arr).to.deep.include(values);
                        });
                    }
                    else
                    {
                        it("Should contain only numbers between -1 and 1",
                        function()
                        {
                            const arr = allocNaN(encoder.size);
                            encoder.encode(arr, state);
                            for (let j = 0; j < encoder.size; ++j)
                            {
                                const x = arr[j];
                                expect(x >= -1 && x <= 1,
                                        `Value ${x} at index ${j} was out of ` +
                                        "range")
                                    .to.be.true;
                            }
                        });
                    }
                });
            }
        });
    }

    const map = {a: 0, b: 1, c: 2};
    const pcEncoder = encoders.possibilityClassEncoder(["a", "b", "c"]);
    testEncoder("PossibilityClass",
    {
        name: "Unnarrowed",
        encoder: pcEncoder,
        init: () => new PossibilityClass(map),
        values: new Float32Array([1/3, 1/3, 1/3])
    },
    {
        name: "Fully narrowed",
        encoder: pcEncoder,
        init()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("b");
            return pc;
        },
        values: new Float32Array([0, 1, 0])
    });

    testEncoder("TempStatus",
    {
        name: "Unset",
        encoder: encoders.tempStatusEncoder,
        init: () => new TempStatus("taunt", 5)
    });

    testEncoder("ItemTempStatus",
    {
        name: "Fully Initialized",
        encoder: encoders.itemTempStatusEncoder(["reflect"]),
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("magikarp");
            its.start(mon, "reflect");
            return its;
        }
    },
    {
        name: "Fully Initialized + Extended",
        encoder: encoders.itemTempStatusEncoder(["reflect"]),
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("magikarp");
            mon.setItem("lightclay");
            its.start(mon, "reflect");
            return its;
        }
    },
    {
        name: "Fully Initialized + Infinite",
        encoder: encoders.itemTempStatusEncoder(["reflect"]),
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("magikarp");
            its.start(mon, "reflect", /*infinite*/true);
            return its;
        }
    },
    {
        name: "Unset",
        encoder: encoders.itemTempStatusEncoder(["reflect"]),
        init: () => new ItemTempStatus([5, 8], {reflect: "lightclay"}),
        values: new Float32Array([0, 0])
    });

    testEncoder("VariableTempStatus",
    {
        name: "Unset",
        encoder: encoders.variableTempStatusEncoder(["x", "y"]),
        init: () => new VariableTempStatus({x: 1, y: 2}, 5)
    });

    testEncoder("StatRange",
    {
        name: "Fully Initialized",
        encoder: encoders.statRangeEncoder,
        init: () => new StatRange(100, 100, /*hp*/false)
    },
    {
        name: "Fully Initialized + HP",
        encoder: encoders.statRangeEncoder,
        init: () => new StatRange(100, 100, /*hp*/true)
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownStatRangeEncoder,
        init: () => null,
        values: new Float32Array([0.5, 0.5, 0.5])
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyStatRangeEncoder,
        init: () => undefined,
        values: new Float32Array([-1, -1, -1])
    });

    testEncoder("StatTable",
    {
        name: "Fully Initialized",
        encoder: encoders.statTableEncoder,
        init: () => StatTable.base(dex.pokemon["magikarp"], 100)
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownStatTableEncoder,
        init: () => null
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyStatTableEncoder,
        init: () => undefined
    });

    testEncoder("PokemonTraits",
    {
        name: "Fully Initialized",
        encoder: encoders.pokemonTraitsEncoder,
        init: () => ({traits: PokemonTraits.base(dex.pokemon["magikarp"], 100)})
    },
    {
        name: "Added Type",
        encoder: encoders.pokemonTraitsEncoder,
        init: () =>
        ({
            traits: PokemonTraits.base(dex.pokemon["magikarp"], 100),
            addedType: "fire" as const
        })
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownPokemonTraitsEncoder,
        init: () => null
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyPokemonTraitsEncoder,
        init: () => undefined
    });

    testEncoder("VolatileStatus",
    {
        name: "Fully Initialized",
        encoder: encoders.volatileStatusEncoder,
        init()
        {
            const v = new VolatileStatus();
            v.overrideTraits = PokemonTraits.base(dex.pokemon["magikarp"], 100);
            return v;
        }
    },
    {
        name: "Everything Set",
        encoder: encoders.volatileStatusEncoder,
        init()
        {
            const v = new VolatileStatus();
            setAllVolatiles(v);
            return v;
        }
    });

    testEncoder("MajorStatusCounter",
    {
        name: "Fully Initialized",
        encoder: encoders.majorStatusCounterEncoder,
        init: () => new MajorStatusCounter()
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownMajorStatusCounterEncoder,
        init: () => null
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyMajorStatusCounterEncoder,
        init: () => undefined
    });

    testEncoder("Move",
    {
        name: "Fully Initialized",
        encoder: encoders.moveEncoder,
        init: () => new Move("tackle")
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownMoveEncoder,
        init: () => null
    },
    {
        name: "Unrevealed + Constraint",
        encoder: encoders.constrainedMoveEncoder,
        init: (): encoders.ConstrainedMoveArgs =>
        ({
            move: "constrained", constraint: {tackle: 2, splash: 1}, total: 3
        })
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyMoveEncoder,
        init: () => undefined
    });

    testEncoder("Moveset",
    {
        name: "Fully Initialized",
        encoder: encoders.movesetEncoder,
        init: () => new Moveset(["splash", "tackle", "hiddenpower", "return"])
    },
    {
        name: "Partially Initialized",
        encoder: encoders.movesetEncoder,
        init()
        {
            const moveset = new Moveset(
                ["splash", "tackle", "metronome", "protect"], 3);
            moveset.reveal("splash");
            moveset.addMoveSlotConstraint(["tackle", "metronome"]);
            return moveset;
        }
    },
    {
        name: "Uninitialized",
        encoder: encoders.movesetEncoder,
        init: () => new Moveset()
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownMovesetEncoder,
        init: () => null
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyMovesetEncoder,
        init: () => undefined
    });

    testEncoder("HP",
    {
        name: "Fully Initialized",
        encoder: encoders.hpEncoder,
        init()
        {
            const hp = new HP();
            hp.set(50, 100);
            return {hp, ours: true};
        },
        values: new Float32Array([0.5, 100 / encoders.maxStatHP])
    },
    {
        name: "Uninitialized",
        encoder: encoders.hpEncoder,
        init: () => ({hp: new HP(), ours: true}),
        values: new Float32Array([0, 0])
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownHPEncoder,
        init: () => null,
        values: new Float32Array([1, 0.5])
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyHPEncoder,
        init: () => undefined,
        values: new Float32Array([-1, -1])
    });

    testEncoder("Pokemon",
    {
        name: "Active",
        encoder: encoders.activePokemonEncoder,
        init()
        {
            const mon = new Pokemon("magikarp");
            mon.switchInto();
            return {mon, ours: true};
        }
    },
    {
        name: "Inactive",
        encoder: encoders.inactivePokemonEncoder,
        init: () => ({mon: new Pokemon("magikarp"), ours: true})
    },
    {
        name: "Unrevealed",
        encoder: encoders.unknownPokemonEncoder,
        init: () => null
    },
    {
        name: "Nonexistent",
        encoder: encoders.emptyPokemonEncoder,
        init: () => undefined
    });

    testEncoder("TeamStatus",
    {
        encoder: encoders.teamStatusEncoder,
        init: () => new TeamStatus()
    });

    testEncoder("Team",
    {
        encoder: encoders.teamEncoder,
        init()
        {
            const team = new Team("p1");
            team.size = 2;
            team.switchIn(switchInOptions);
            return {team, ours: true};
        }
    });

    testEncoder("RoomStatus",
    {
        encoder: encoders.roomStatusEncoder,
        init: () => new RoomStatus()
    });

    testEncoder("BattleState",
    {
        encoder: encoders.battleStateEncoder,
        init()
        {
            const state = new BattleState("username");
            state.ourSide = "p2";
            state.teams.p1!.size = 1;
            state.teams.p1!.switchIn(switchInOptions);
            state.teams.p2!.size = 1;
            state.teams.p2!.switchIn(switchInOptions);
            return state;
        }
    });
});
