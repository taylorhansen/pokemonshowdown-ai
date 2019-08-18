import { expect } from "chai";
import "mocha";
import { Team } from "../../../src/battle/state/Team";

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
            expect(team.switchIn("Magikarp", 100, "M", 200, 200))
                .to.not.equal(null);
            expect(team.switchIn("Porygon", 100, "M", 100, 100)).to.equal(null);
        });

        it("Should switch", function()
        {
            team.size = 2;
            // switch in/out
            const mon1 = team.switchIn("Magikarp", 100, "M", 200, 200)!;
            const mon2 = team.switchIn("Porygon", 100, "M", 300, 300)!;
            // switch back in
            const mon3 = team.switchIn("Magikarp", 100, "M", 200, 200)!;
            expect(mon1).to.equal(mon3);
            expect(mon1.active).to.equal(true);
            expect(mon2.active).to.equal(false);
        });

        it("Should copy volatile", function()
        {
            team.size = 2;
            const mon1 = team.switchIn("Magikarp", 100, "M", 200, 200)!;
            mon1.volatile.boosts.spa = 2;
            const mon2 = team.switchIn("Porygon", 100, "M", 300, 300,
                    {copyVolatile: true})!;
            expect(mon2.volatile.boosts.spa).to.equal(2);
        });
    });

    describe("#reveal()", function()
    {
        it("Should not overflow team size", function()
        {
            team.size = 1;
            expect(team.reveal("Magikarp", 100, "M", 200, 200))
                .to.not.equal(null);
            expect(team.reveal("Porygon", 100, "M", 300, 300)).to.equal(null);
        });
    });

    describe("#cure()", function()
    {
        it("Should cure all team pokemon", function()
        {
            team.size = 2;
            const mon1 = team.reveal("Magikarp", 100, "M", 200, 200)!;
            mon1.majorStatus.afflict("brn");
            const mon2 = team.reveal("Porygon", 100, "M", 300, 300)!;
            mon2.majorStatus.afflict("frz");
            team.cure();
            expect(mon1.majorStatus.current).to.be.null;
            expect(mon2.majorStatus.current).to.be.null;
        });
    });
});
