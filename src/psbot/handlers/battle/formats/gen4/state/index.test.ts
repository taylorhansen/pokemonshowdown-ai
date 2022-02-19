import "mocha";
import * as Hp from "./Hp.test";
import * as MajorStatusCounter from "./MajorStatusCounter.test";
import * as Move from "./Move.test";
import * as Moveset from "./Moveset.test";
import * as MultiTempStatus from "./MultiTempStatus.test";
import * as Pokemon from "./Pokemon.test";
import * as RoomStatus from "./RoomStatus.test";
import * as StatRange from "./StatRange.test";
import * as StatTable from "./StatTable.test";
import * as Team from "./Team.test";
import * as TeamStatus from "./TeamStatus.test";
import * as TempStatus from "./TempStatus.test";
import * as VolatileStatus from "./VolatileStatus.test";
import * as utility from "./utility.test";

export const test = () =>
    describe("state", function () {
        Hp.test();
        MajorStatusCounter.test();
        Move.test();
        Moveset.test();
        MultiTempStatus.test();
        Pokemon.test();
        RoomStatus.test();
        StatRange.test();
        StatTable.test();
        Team.test();
        TeamStatus.test();
        TempStatus.test();
        VolatileStatus.test();
        utility.test();
    });
