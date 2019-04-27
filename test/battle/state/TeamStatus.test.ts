import { expect } from "chai";
import "mocha";
import { TeamStatus } from "../../../src/battle/state/TeamStatus";

describe("TeamStatus", function()
{
    describe("toArray", function()
    {
        const status = new TeamStatus();
        status.selfSwitch = "copyvolatile";
        expect(status.toArray()).to.not.be.empty;
    });
});
