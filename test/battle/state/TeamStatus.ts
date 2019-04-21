import { expect } from "chai";
import "mocha";
import { TeamStatus } from "../../../src/battle/state/TeamStatus";

describe("TeamStatus", function()
{
    describe("toArray", function()
    {
        const status = new TeamStatus();
        status.selfSwitch = "copyvolatile";
        // tslint:disable-next-line:no-unused-expression
        expect(status.toArray()).to.not.be.empty;
    });
});
