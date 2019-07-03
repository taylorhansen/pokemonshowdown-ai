import { expect } from "chai";
import "mocha";
import { TempStatus } from "../../../src/battle/state/TempStatus";

describe("TempStatus", function()
{
    /** Checks the `#isActive` and `#turns` properties of a TempStatus. */
    function check(ts: TempStatus, isActive: boolean, turns: number): void
    {
        expect(ts).to.have.property("isActive", isActive);
        expect(ts).to.have.property("turns", turns);
    }

    describe("#isActive/#turns", function()
    {
        it("Should have 0 turns initially", function()
        {
            const ts = new TempStatus("", 1);
            check(ts, false, 0);
        });
    });

    describe("#start()", function()
    {
        it("Should set turns to 1 and be active", function()
        {
            const ts = new TempStatus("", 1);
            ts.start();
            check(ts, true, 1);
        });

        it("Should restart status", function()
        {
            const ts = new TempStatus("", 1);
            ts.start();
            ts.tick();
            ts.start();
            check(ts, true, 1);
        });

        describe("restart = false", function()
        {
            it("Should not restart status", function()
            {
                const ts = new TempStatus("", 1);
                ts.start();
                ts.tick();
                ts.start(/*restart*/false);
                check(ts, true, 2);
            });
        });
    });

    describe("#tick()", function()
    {
        it("Should increment turns if active", function()
        {
            const ts = new TempStatus("", 1);
            ts.start();
            ts.tick();
            check(ts, true, 2);
        });

        it("Should not increment turns if not active", function()
        {
            const ts = new TempStatus("", 1);
            ts.tick();
            check(ts, false, 0);
        });

        it("Should fail if ticked past max duration", function()
        {
            const ts = new TempStatus("status", 3);
            ts.start();
            for (let i = 0; i < 3; ++i)
            {
                ts.tick();
                check(ts, true, i + 2);
            }
            expect(() => ts.tick()).to.throw(Error,
                "TempStatus 'status' lasted longer than expected (4/3 turns)");
        });

        describe("#silent = true", function()
        {
            it("Should end status on last tick", function()
            {
                const ts = new TempStatus("", 3, /*silent*/true);
                ts.start();
                for (let i = 0; i < 2; ++i)
                {
                    ts.tick();
                    check(ts, true, i + 2);
                }
                ts.tick();
                check(ts, false, 0);
            });
        });
    });

    describe("#end()", function()
    {
        it("Should set turns to 0 and not be active", function()
        {
            const ts = new TempStatus("", 1);
            ts.start();
            ts.tick();
            ts.end();
            check(ts, false, 0);
        });
    });

    describe("#copyTo()", function()
    {
        it("Should copy turn data if name and duration match", function()
        {
            const ts = new TempStatus("status", 1);
            const ts2 = new TempStatus(ts.name, ts.duration);
            ts.start();
            ts.copyTo(ts2);
            check(ts, true, 1);
            check(ts2, true, 1);
        });

        it("Should not copy if mismatched name", function()
        {
            const ts = new TempStatus("status", 1);
            const ts2 = new TempStatus("other status", ts.duration);
            expect(() => ts.copyTo(ts2)).to.throw(Error,
                "TempStatus 'status' of duration 1 can't be copied to " +
                "TempStatus 'other status' of duration 1");
        });

        it("Should not copy if mismatched duration", function()
        {
            const ts = new TempStatus("status", 1);
            const ts2 = new TempStatus(ts.name, ts.duration + 1);
            expect(() => ts.copyTo(ts2)).to.throw(Error,
                "TempStatus 'status' of duration 1 can't be copied to " +
                "TempStatus 'status' of duration 2");
        });
    });
});
