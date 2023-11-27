import "mocha";
import * as hp from "./Hp.test";
import * as majorStatusCounter from "./MajorStatusCounter.test";
import * as move from "./Move.test";
import * as moveset from "./Moveset.test";
import * as multiTempStatus from "./MultiTempStatus.test";
import * as pokemon from "./Pokemon.test";
import * as roomStatus from "./RoomStatus.test";
import * as statRange from "./StatRange.test";
import * as statTable from "./StatTable.test";
import * as team from "./Team.test";
import * as teamStatus from "./TeamStatus.test";
import * as tempStatus from "./TempStatus.test";
import * as volatileStatus from "./VolatileStatus.test";
import * as encoder from "./encoder/index.test";
import * as utility from "./utility.test";

export const test = () =>
    describe("state", function () {
        hp.test();
        majorStatusCounter.test();
        move.test();
        moveset.test();
        multiTempStatus.test();
        pokemon.test();
        roomStatus.test();
        statRange.test();
        statTable.test();
        team.test();
        teamStatus.test();
        tempStatus.test();
        volatileStatus.test();
        utility.test();
        encoder.test();
    });
