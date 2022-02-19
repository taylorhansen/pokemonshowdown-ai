import {expect} from "chai";
import "mocha";
import {futureMoveKeys} from "../dex";
import {TeamStatus} from "./TeamStatus";

export const test = () =>
    describe("TeamStatus", function () {
        let status: TeamStatus;

        beforeEach("Initialize TeamStatus", function () {
            status = new TeamStatus();
        });

        describe("#wish", function () {
            it("Should have silent=true", function () {
                expect(status.wish).to.have.property("silent", true);
            });
        });

        describe("#futureMoves", function () {
            for (const id of futureMoveKeys) {
                describe(id, function () {
                    it("Should have silent=true", function () {
                        expect(status.futureMoves[id]).to.have.property(
                            "silent",
                            true,
                        );
                    });
                });
            }
        });

        describe("#postTurn()", function () {
            it("Should tick future move turns", function () {
                status.futureMoves.futuresight.start();
                expect(status.futureMoves.futuresight.turns).to.equal(0);
                status.postTurn();
                expect(status.futureMoves.futuresight.turns).to.equal(1);
                status.postTurn();
                expect(status.futureMoves.futuresight.turns).to.equal(2);
                status.postTurn();
                expect(status.futureMoves.futuresight.turns).to.equal(0);
            });

            for (const type of [
                "lightscreen",
                "luckychant",
                "mist",
                "reflect",
                "safeguard",
                "tailwind",
            ] as const) {
                it(`Should tick ${type} turns`, function () {
                    status[type].start();
                    expect(status[type].turns).to.equal(0);

                    status.postTurn();
                    expect(status[type].turns).to.equal(1);
                });
            }

            it("Should tick wish turns", function () {
                status.wish.start();
                expect(status.wish.turns).to.equal(0);
                status.postTurn();
                expect(status.wish.turns).to.equal(1);
                status.postTurn();
                expect(status.wish.isActive).to.be.false;
                expect(status.wish.turns).to.equal(0);
            });
        });
    });
