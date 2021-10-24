import "mocha";
import * as Hp from "./Hp.test";
import * as ItemTempStatus from "./ItemTempStatus.test";
import * as MajorStatusCounter from "./MajorStatusCounter.test";
import * as Move from "./Move.test";
import * as Moveset from "./Moveset.test";
import * as Pokemon from "./Pokemon.test";
import * as PokemonTraits from "./PokemonTraits.test";
import * as PossibilityClass from "./PossibilityClass.test";
import * as RoomStatus from "./RoomStatus.test";
import * as StatRange from "./StatRange.test";
import * as StatTable from "./StatTable.test";
import * as Team from "./Team.test";
import * as TeamStatus from "./TeamStatus.test";
import * as TempStatus from "./TempStatus.test";
import * as VariableTempStatus from "./VariableTempStatus.test";
import * as VolatileStatus from "./VolatileStatus.test";
import * as utility from "./utility.test";

export const test = () => describe("state", function()
{
    Hp.test();
    ItemTempStatus.test();
    MajorStatusCounter.test();
    Move.test();
    Moveset.test();
    Pokemon.test();
    PokemonTraits.test();
    PossibilityClass.test();
    RoomStatus.test();
    StatRange.test();
    StatTable.test();
    Team.test();
    TeamStatus.test();
    TempStatus.test();
    utility.test();
    VariableTempStatus.test();
    VolatileStatus.test();
});
