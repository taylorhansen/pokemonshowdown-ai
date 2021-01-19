import { expect } from "chai";
import "mocha";
import { Encoder } from "../../../src/ai/encoder/Encoder";
import * as encoders from "../../../src/ai/encoder/encoders";
import { limitedStatusTurns, oneHotEncoder, OneHotEncoderArgs } from
    "../../../src/ai/encoder/helpers";
import * as dex from "../../../src/battle/dex/dex";
import { SwitchOptions } from "../../../src/battle/parser/BattleEvent";
import { BattleState } from "../../../src/battle/state/BattleState";
import { HP } from "../../../src/battle/state/HP";
import { ItemTempStatus } from "../../../src/battle/state/ItemTempStatus";
import { MajorStatusCounter } from
    "../../../src/battle/state/MajorStatusCounter";
import { Move } from "../../../src/battle/state/Move";
import { Moveset } from "../../../src/battle/state/Moveset";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { PokemonTraits } from "../../../src/battle/state/PokemonTraits";
import { PossibilityClass } from "../../../src/battle/state/PossibilityClass";
import { RoomStatus } from "../../../src/battle/state/RoomStatus";
import { StatRange } from "../../../src/battle/state/StatRange";
import { StatTable } from "../../../src/battle/state/StatTable";
import { Team } from "../../../src/battle/state/Team";
import { TeamStatus } from "../../../src/battle/state/TeamStatus";
import { TempStatus } from "../../../src/battle/state/TempStatus";
import { VariableTempStatus } from
    "../../../src/battle/state/VariableTempStatus";
import { VolatileStatus } from "../../../src/battle/state/VolatileStatus";
import { setAllVolatiles } from "../../battle/state/helpers";

const switchInOptions: SwitchOptions =
    {species: "magikarp", level: 100, gender: "M", hp: 200, hpMax: 200};

describe("BattleState encoders", function()
{
    describe("oneHot()", function()
    {
        function testOneHot(length: number, args: OneHotEncoderArgs):
            Float32Array
        {
            const encoder = oneHotEncoder(length);
            const arr = encoders.allocUnsafe(encoder);
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

                            const arr = encoders.allocUnsafe(encoder);
                            encoder.encode(arr, state);
                            expect(arr).to.deep.include(values);
                        });
                    }
                    else
                    {
                        it("Should contain only numbers between -1 and 1",
                        function()
                        {
                            const arr = encoders.allocUnsafe(encoder);
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
            const mon = new Pokemon("magikarp", /*hpPercent*/false);
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
            const mon = new Pokemon("magikarp", /*hpPercent*/false);
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
            const mon = new Pokemon("magikarp", /*hpPercent*/false);
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
        init: () => StatTable.base(dex.pokemon.magikarp, 100)
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
        init: () => ({traits: PokemonTraits.base(dex.pokemon.magikarp, 100)})
    },
    {
        name: "Added Type",
        encoder: encoders.pokemonTraitsEncoder,
        init: () =>
        ({
            traits: PokemonTraits.base(dex.pokemon.magikarp, 100),
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
            v.overrideTraits = PokemonTraits.base(dex.pokemon.magikarp, 100);
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
            const hp = new HP(/*isPercent*/false);
            hp.set(50, 100);
            return hp;
        },
        values: new Float32Array([0.5, 100 / encoders.maxStatHP])
    },
    {
        name: "Uninitialized",
        encoder: encoders.hpEncoder,
        init: () => new HP(/*isPercent*/false),
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
            const mon = new Pokemon("magikarp", /*hpPercent*/false);
            mon.switchInto();
            return mon;
        }
    },
    {
        name: "Inactive",
        encoder: encoders.inactivePokemonEncoder,
        init: () => new Pokemon("magikarp", /*hpPercent*/false)
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
            const team = new Team("us");
            team.size = 2;
            team.switchIn(switchInOptions);
            return team;
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
            const state = new BattleState();
            state.teams.us.size = 1;
            state.teams.us.switchIn(switchInOptions);
            state.teams.them.size = 1;
            state.teams.them.switchIn(switchInOptions);
            return state;
        }
    });
});
