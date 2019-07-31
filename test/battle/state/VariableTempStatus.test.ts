import { expect } from "chai";
import "mocha";
import { VariableTempStatus } from
    "../../../src/battle/state/VariableTempStatus";

describe("VariableTempStatus", function()
{
    const map = {a: true, b: true} as const;
    let vts: VariableTempStatus<keyof typeof map>;

    /** Checks VariableTempStatus properties. */
    function check(type: keyof typeof map | "none", active: boolean,
        turns: number): void
    {
        expect(vts.type).to.equal(type);
        expect(vts.isActive).to.be[active ? "true" : "false"];
        expect(vts.turns).to.equal(turns);
    }

    it("Should be reset initially", function()
    {
        vts = new VariableTempStatus(map, 4);
        check("none", false, 0);
    });

    function setup(silent = false)
    {
        beforeEach("Initialize VariableTempStatus with silent=${silent}",
        function()
        {
            vts = new VariableTempStatus(map, 4, silent);
        });
    }

    describe("#reset()", function()
    {
        setup();

        it("Should reset status", function()
        {
            vts.start("b");
            vts.tick();
            vts.reset();
            check("none", false, 0);
        });
    });

    describe("#start()", function()
    {
        setup();

        it("Should start a status", function()
        {
            vts.start("a");
            check("a", true, 0);
        });
    });

    describe("#tick()", function()
    {
        function shouldIncTurns()
        {
            it("Should increment turns", function()
            {
                vts.start("b");
                vts.tick();
                check("b", true, 1);
            });
        }

        /** Ticks one less than the required duration. */
        function tickToDuration()
        {
            for (let i = 0; i < vts.duration; ++i)
            {
                vts.tick();
                check(vts.type, true, i + 1);
            }
        }

        describe("silent = false", function()
        {
            setup();
            shouldIncTurns();

            it("Should throw once over duration", function()
            {
                vts.start("a");
                tickToDuration();
                check("a", true, vts.duration);
                expect(() => vts.tick()).to.throw(Error,
                    "Status 'a' went longer than expected " +
                    `(duration=${vts.duration}, turns=${vts.duration + 1})`);
            });
        });

        describe("silent = true", function()
        {
            setup(true);
            shouldIncTurns();

            it("Should reset once over duration", function()
            {
                vts.start("a");
                tickToDuration();
                check("a", true, vts.duration);
                vts.tick();
                check("none", false, 0);
            });
        });
    });
});
