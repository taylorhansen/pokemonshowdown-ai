import { expect } from "chai";
import "mocha";
import { TempStatus } from "../../../src/battle/state/TempStatus";

describe("TempStatus", function()
{
    let ts: TempStatus;

    beforeEach("Initialize TeamStatus", function()
    {
        ts = new TempStatus("some status", 3);
    });

    it("Should have 0 turns initially", function()
    {
        expect(ts.turns).to.equal(0);
    });

    describe("#start()", function()
    {
        it("Should set turns to 1 and be active", function()
        {
            ts.start();
            expect(ts.isActive).to.be.true;
            expect(ts.turns).to.equal(1);
        });
    });

    describe("#tick()", function()
    {
        it("Should increment turns if active", function()
        {
            ts.start();
            ts.tick();
            expect(ts.isActive).to.be.true;
            expect(ts.turns).to.equal(2);
        });

        it("Should not increment turns if not active", function()
        {
            ts.tick();
            expect(ts.isActive).to.be.false;
            expect(ts.turns).to.equal(0);
        });

        it("Should fail if ticked past max duration", function()
        {
            ts.start();
            for (let i = 0; i < ts.duration; ++i) ts.tick();
            expect(() => ts.tick()).to.throw();
        });
    });

    describe("#end()", function()
    {
        it("Should set turns to 0 and not be active", function()
        {
            ts.start();
            ts.tick();
            ts.end();
            expect(ts.isActive).to.be.false;
            expect(ts.turns).to.equal(0);
        });
    });

    describe("#copyTo()", function()
    {
        it("Should copy turn data if name and duration match", function()
        {
            const ts2 = new TempStatus(ts.name, ts.duration);
            ts.start();
            ts.copyTo(ts2);
            expect(ts.isActive).to.be.true;
            expect(ts.turns).to.equal(1);
            expect(ts2.isActive).to.be.true;
            expect(ts2.turns).to.equal(1);
        });

        it("Should not copy if mismatched name", function()
        {
            const ts2 = new TempStatus("some other status", ts.duration);
            expect(() => ts.copyTo(ts2)).to.throw();
        });

        it("Should not copy if mismatched duration", function()
        {
            const ts2 = new TempStatus(ts.name, ts.duration + 1);
            expect(() => ts.copyTo(ts2)).to.throw();
        });
    });
});
