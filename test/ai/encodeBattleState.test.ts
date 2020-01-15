import { expect } from "chai";
import "mocha";
import { isNumber } from "util";
import { encodeBattleState, encodeHP, encodeItemTempStatus,
    encodeMajorStatusCounter, encodeMove, encodeMoveset, encodePokemon,
    encodePokemonTraits, encodePossiblityClass, encodeRoomStatus,
    encodeStatRange, encodeStatTable, encodeTeam, encodeTeamStatus,
    encodeTempStatus, encodeVariableTempStatus, encodeVolatileStatus,
    limitedStatusTurns, oneHot, sizeActivePokemon, sizeBattleState,
    sizeMajorStatusCounter, sizeMove, sizeMoveset, sizePokemon,
    sizePokemonTraits, sizeRoomStatus, sizeStatRange, sizeStatTable, sizeTeam,
    sizeTeamStatus, sizeTempStatus, sizeVolatileStatus } from
    "../../src/ai/encodeBattleState";
import * as dex from "../../src/battle/dex/dex";
import { DriverSwitchOptions } from "../../src/battle/driver/DriverEvent";
import { BattleState } from "../../src/battle/state/BattleState";
import { HP } from "../../src/battle/state/HP";
import { ItemTempStatus } from "../../src/battle/state/ItemTempStatus";
import { MajorStatusCounter } from "../../src/battle/state/MajorStatusCounter";
import { Move } from "../../src/battle/state/Move";
import { Moveset } from "../../src/battle/state/Moveset";
import { Pokemon } from "../../src/battle/state/Pokemon";
import { PokemonTraits } from "../../src/battle/state/PokemonTraits";
import { PossibilityClass } from "../../src/battle/state/PossibilityClass";
import { RoomStatus } from "../../src/battle/state/RoomStatus";
import { StatRange } from "../../src/battle/state/StatRange";
import { StatTable } from "../../src/battle/state/StatTable";
import { Team } from "../../src/battle/state/Team";
import { TeamStatus } from "../../src/battle/state/TeamStatus";
import { TempStatus } from "../../src/battle/state/TempStatus";
import { VariableTempStatus } from "../../src/battle/state/VariableTempStatus";
import { VolatileStatus } from "../../src/battle/state/VolatileStatus";
import { setAllVolatiles } from "../battle/state/helpers";

const switchInOptions: DriverSwitchOptions =
    {species: "Magikarp", level: 100, gender: "M", hp: 200, hpMax: 200};

describe("BattleState encoders", function()
{
    describe("oneHot()", function()
    {
        it("Should encode class of values", function()
        {
            expect(oneHot(1, 3)).to.have.members([0, 1, 0]);
        });

        it("Should encode class of values with custom 1/0 values", function()
        {
            expect(oneHot(1, 3, 10, 3)).to.have.members([3, 10, 3]);
        });

        it("Should output 0's if index is null", function()
        {
            expect(oneHot(null, 3)).to.have.members([0, 0, 0]);
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

    interface CaseArgsBase<TState>
    {
        name?: string;
        encoder(state: TState): number[];
        init(): TState;
    }

    interface CaseArgsSize<TState> extends CaseArgsBase<TState>
    {
        size: number;
        values?: undefined;
    }

    interface CaseArgsValues<TState> extends CaseArgsBase<TState>
    {
        size?: undefined;
        values?: number[];
    }

    type CaseArgs<TState> = CaseArgsSize<TState> | CaseArgsValues<TState>;

    function testEncoder<TState, TStates extends TState[]>(name: string,
        ...cases: {[T in keyof TStates]: CaseArgs<TStates[T]>}): void
    {
        describe(`encode${name}()`, function()
        {
            for (let i = 0; i < cases.length; ++i)
            {
                const c = cases[i];
                describe(`Case ${i + 1}${c.name ? ` (${c.name})` : ""}`,
                function()
                {
                    let state: TState;

                    beforeEach(`Initialize ${name}`, function()
                    {
                        state = c.init();
                    });

                    if (c.values)
                    {
                        const values = c.values;
                        it(`Should be [${values.join(", ")}]`, function()
                        {
                            expect(c.encoder(state)).to.have.members(values);
                        });
                    }
                    else if (c.size)
                    {
                        const size = c.size;
                        it(`Should have length of ${size} and contain only ` +
                            "finite numbers", function()
                        {
                            const data = c.encoder(state);
                            expect(data).to.have.lengthOf(size);
                            for (const x of data)
                            {
                                expect(isNumber(x)).to.be.true;
                                expect(isFinite(x)).to.be.true;
                            }
                        });
                    }
                });
            }
        });
    }

    const map = {a: 0, b: 1, c: 2};
    testEncoder("PossibilityClass",
    {
        name: "Unnarrowed",
        encoder: (pc: PossibilityClass<number>) =>
            encodePossiblityClass(pc, x => x),
        init: () => new PossibilityClass(map),
        values: [1 / 3, 1 / 3, 1 / 3]
    },
    {
        name: "Fully narrowed",
        encoder: (pc: PossibilityClass<number>) =>
            encodePossiblityClass(pc, x => x),
        init()
        {
            const pc = new PossibilityClass(map);
            pc.narrow("b");
            return pc;
        },
        values: [0, 1, 0]
    });

    testEncoder("TempStatus",
    {
        name: "Unset",
        encoder: encodeTempStatus,
        init: () => new TempStatus("taunt", 5),
        size: sizeTempStatus
    });

    testEncoder("ItemTempStatus",
    {
        name: "Fully Initialized",
        encoder: encodeItemTempStatus,
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            its.start(mon, "reflect");
            return its;
        },
        size: 2
    },
    {
        name: "Fully Initialized + Extended",
        encoder: encodeItemTempStatus,
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            mon.setItem("lightclay");
            its.start(mon, "reflect");
            return its;
        },
        size: 2
    },
    {
        name: "Fully Initialized + Infinite",
        encoder: encodeItemTempStatus,
        init()
        {
            const its = new ItemTempStatus([5, 8], {reflect: "lightclay"});
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            its.start(mon, "reflect", /*infinite*/true);
            return its;
        },
        size: 2
    },
    {
        name: "Unset",
        encoder: encodeItemTempStatus,
        init: () => new ItemTempStatus([5, 8], {reflect: "lightclay"}),
        values: [0, 0]
    });

    testEncoder("VariableTempStatus",
    {
        name: "Unset",
        encoder: encodeVariableTempStatus,
        init: () => new VariableTempStatus({x: 1, y: 2}, 5),
        size: 2
    });

    testEncoder("StatRange",
    {
        name: "Fully Initialized",
        encoder: encodeStatRange,
        init()
        {
            const stat = new StatRange(/*hp*/false);
            stat.calc(100, 100);
            return stat;
        },
        size: sizeStatRange
    },
    {
        name: "Fully Initialized + HP",
        encoder: encodeStatRange,
        init()
        {
            const stat = new StatRange(/*hp*/true);
            stat.calc(100, 100);
            return stat;
        },
        size: sizeStatRange
    },
    {
        name: "Uninitialized",
        encoder: encodeStatRange,
        init: () => new StatRange(/*hp*/false),
        size: sizeStatRange
    },
    {
        name: "Uninitialized + HP",
        encoder: encodeStatRange,
        init: () => new StatRange(/*hp*/true),
        size: sizeStatRange
    },
    {
        name: "Unrevealed",
        encoder: () => encodeStatRange(null, /*hp*/false),
        init: () => null,
        size: sizeStatRange
    },
    {
        name: "Unrevealed + HP",
        encoder: () => encodeStatRange(null, /*hp*/true),
        init: () => null,
        size: sizeStatRange
    },
    {
        name: "Nonexistent",
        encoder: encodeStatRange,
        init: () => undefined,
        size: sizeStatRange
    });

    testEncoder("StatTable",
    {
        name: "Fully Initialized",
        encoder: encodeStatTable,
        init()
        {
            const stats = new StatTable();
            stats.data = dex.pokemon.Magikarp;
            stats.level = 100;
            return stats;
        },
        size: sizeStatTable
    },
    {
        name: "Unrevealed",
        encoder: encodeStatTable,
        init: () => null,
        size: sizeStatTable
    },
    {
        name: "Nonexistent",
        encoder: encodeStatTable,
        init: () => undefined,
        size: sizeStatTable
    });

    testEncoder("PokemonTraits",
    {
        name: "Fully Initialized",
        encoder: encodePokemonTraits,
        init()
        {
            const traits = new PokemonTraits();
            traits.init();
            traits.setSpecies("Magikarp");
            traits.stats.level = 100;
            return traits;
        },
        size: sizePokemonTraits
    },
    {
        name: "Added Type",
        encoder: (traits: PokemonTraits) => encodePokemonTraits(traits, "fire"),
        init()
        {
            const traits = new PokemonTraits();
            traits.init();
            traits.setSpecies("Magikarp");
            traits.stats.level = 100;
            return traits;
        },
        size: sizePokemonTraits
    },
    {
        name: "Unrevealed",
        encoder: encodePokemonTraits,
        init: () => null,
        size: sizePokemonTraits
    },
    {
        name: "Nonexistent",
        encoder: encodePokemonTraits,
        init: () => undefined,
        size: sizePokemonTraits
    });

    testEncoder("VolatileStatus",
    {
        name: "Fully Initialized",
        encoder: encodeVolatileStatus,
        init()
        {
            const v = new VolatileStatus();
            v.overrideTraits.init();
            v.overrideTraits.setSpecies("Magikarp");
            v.overrideTraits.stats.level = 100;
            return v;
        },
        size: sizeVolatileStatus
    },
    {
        name: "Everything Set",
        encoder: encodeVolatileStatus,
        init()
        {
            const v = new VolatileStatus();
            setAllVolatiles(v);
            return v;
        },
        size: sizeVolatileStatus
    });

    testEncoder("MajorStatusCounter",
    {
        name: "Fully Initialized",
        encoder: encodeMajorStatusCounter,
        init: () => new MajorStatusCounter(),
        size: sizeMajorStatusCounter
    },
    {
        name: "Unrevealed",
        encoder: encodeMajorStatusCounter,
        init: () => null,
        size: sizeMajorStatusCounter
    },
    {
        name: "Nonexistent",
        encoder: encodeMajorStatusCounter,
        init: () => undefined,
        size: sizeMajorStatusCounter
    });

    testEncoder("Move",
    {
        name: "Fully Initialized",
        encoder: encodeMove,
        init: () => new Move("tackle"),
        size: sizeMove
    },
    {
        name: "Unrevealed",
        encoder: encodeMove,
        init: () => null,
        size: sizeMove
    },
    {
        name: "Unrevealed + Constraint",
        encoder: (s: Set<string>) => encodeMove(null, s),
        init: () => new Set(["splash", "tackle"]),
        size: sizeMove
    },
    {
        name: "Nonexistent",
        encoder: encodeMove,
        init: () => undefined,
        size: sizeMove
    });

    testEncoder("Moveset",
    {
        name: "Fully Initialized",
        encoder: encodeMoveset,
        init: () => new Moveset(["splash", "tackle", "hiddenpower", "return"]),
        size: sizeMoveset
    },
    {
        name: "Partially Initialized",
        encoder: encodeMoveset,
        init()
        {
            const moveset = new Moveset(["splash", "tackle", "metronome"], 2);
            moveset.reveal("splash");
            return moveset;
        },
        size: sizeMoveset
    },
    {
        name: "Uninitialized",
        encoder: encodeMoveset,
        init: () => new Moveset(),
        size: sizeMoveset
    },
    {
        name: "Unrevealed",
        encoder: encodeMoveset,
        init: () => null,
        size: sizeMoveset
    },
    {
        name: "Nonexistent",
        encoder: encodeMoveset,
        init: () => undefined,
        size: sizeMoveset
    });

    testEncoder("HP",
    {
        name: "Fully Initialized",
        encoder: encodeHP,
        init()
        {
            const hp = new HP(/*isPercent*/false);
            hp.set(50, 100);
            return hp;
        },
        values: [50, 100]
    },
    {
        name: "Uninitialized",
        encoder: encodeHP,
        init: () => new HP(/*isPercent*/false),
        values: [0, 0]
    },
    {
        name: "Unrevealed",
        encoder: encodeHP,
        init: () => null,
        values: [100, 100]
    },
    {
        name: "Nonexistent",
        encoder: encodeHP,
        init: () => undefined,
        values: [-1, -1]
    });

    testEncoder("Pokemon",
    {
        name: "Active",
        encoder: encodePokemon,
        init()
        {
            const mon = new Pokemon("Magikarp", /*hpPercent*/false);
            mon.switchInto();
            return mon;
        },
        size: sizeActivePokemon
    },
    {
        name: "Inactive",
        encoder: encodePokemon,
        init: () => new Pokemon("Magikarp", /*hpPercent*/false),
        size: sizePokemon
    },
    {
        name: "Unrevealed",
        encoder: encodePokemon,
        init: () => null,
        size: sizePokemon
    },
    {
        name: "Nonexistent",
        encoder: encodePokemon,
        init: () => undefined,
        size: sizePokemon
    });

    testEncoder("TeamStatus",
    {
        encoder: encodeTeamStatus,
        init: () => new TeamStatus(),
        size: sizeTeamStatus
    });

    testEncoder("Team",
    {
        encoder: encodeTeam,
        init()
        {
            const team = new Team("us");
            team.size = 1;
            team.switchIn(switchInOptions);
            return team;
        },
        size: sizeTeam
    });

    testEncoder("RoomStatus",
    {
        encoder: encodeRoomStatus,
        init: () => new RoomStatus(),
        size: sizeRoomStatus
    });

    testEncoder("BattleState",
    {
        encoder: encodeBattleState,
        init()
        {
            const state = new BattleState();
            state.teams.us.size = 1;
            state.teams.us.switchIn(switchInOptions);
            state.teams.them.size = 1;
            state.teams.them.switchIn(switchInOptions);
            return state;
        },
        size: sizeBattleState
    });
});
