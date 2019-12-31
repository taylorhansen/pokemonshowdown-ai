import { expect } from "chai";
import "mocha";
import { DriverSwitchOptions } from "../../../src/battle/driver/DriverEvent";
import { Team } from "../../../src/battle/state/Team";

const options1: DriverSwitchOptions =
    {species: "Magikarp", level: 100, gender: "M", hp: 200, hpMax: 200};
const options2: DriverSwitchOptions =
    {species: "Porygon", level: 100, gender: null, hp: 300, hpMax: 300};

describe("Team", function()
{
    let team: Team;

    beforeEach("Initialize Team", function()
    {
        team = new Team("us");
    });

    describe("#size", function()
    {
        // TODO: test size clearing behavior

        it("Should be 1 if set to 0", function()
        {
            team.size = 0;
            expect(team.size).to.equal(1);
        });

        it("Should be 1 if set to a negative number", function()
        {
            team.size = -1;
            expect(team.size).to.equal(1);
        });

        it(`Should be ${Team.maxSize} if set to a larger number`, function()
        {
            team.size = Team.maxSize + 1;
            expect(team.size).to.equal(Team.maxSize);
        });

        it("Should not set hpPercent on our team", function()
        {
            team.size = 3;
            for (const mon of team.pokemon)
            {
                if (mon) expect(mon.hp.isPercent).to.equal(false);
            }
        });

        it("Should set hpPercent on their team", function()
        {
            team = new Team("them");
            team.size = 3;
            for (const mon of team.pokemon)
            {
                if (mon) expect(mon.hp.isPercent).to.equal(true);
            }
        });
    });

    describe("#switchIn()", function()
    {

        it("Should not overflow team size", function()
        {
            team.size = 1;

            expect(team.switchIn(options1)).to.not.equal(null);

            // after the team is full, subsequent switch-ins will be rejected
            expect(team.switchIn(options2)).to.equal(null);
        });

        it("Should switch", function()
        {
            team.size = 2;
            // switch in/out
            const mon1 = team.switchIn(options1)!;
            const mon2 = team.switchIn(options2)!;
            // switch back in
            const mon3 = team.switchIn(options1)!;
            expect(mon1).to.equal(mon3);
            expect(mon1.active).to.equal(true);
            expect(mon2.active).to.equal(false);
        });

        it("Should handle copyvolatile", function()
        {
            team.size = 2;
            const mon1 = team.switchIn(options1)!;
            mon1.volatile.boosts.spa = 2;

            team.status.selfSwitch = "copyvolatile";
            const mon2 = team.switchIn(options2)!;
            expect(mon2.volatile.boosts.spa).to.equal(2);
            expect(team.status.selfSwitch).to.be.false;
        });
    });

    describe("#reveal()", function()
    {
        it("Should not overflow team size", function()
        {
            team.size = 1;
            expect(team.reveal(options1))
                .to.not.equal(null);
            expect(team.reveal(options2)).to.equal(null);
        });
    });

    describe("#cure()", function()
    {
        it("Should cure all team pokemon", function()
        {
            team.size = 2;
            const mon1 = team.reveal(options1)!;
            mon1.majorStatus.afflict("brn");
            const mon2 = team.reveal(options2)!;
            mon2.majorStatus.afflict("frz");
            team.cure();
            expect(mon1.majorStatus.current).to.be.null;
            expect(mon2.majorStatus.current).to.be.null;
        });
    });
});
