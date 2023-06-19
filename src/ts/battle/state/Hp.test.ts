import {expect} from "chai";
import "mocha";
import {Hp} from "./Hp";

export const test = () =>
    describe("Hp", function () {
        describe("#set()", function () {
            it("Should set current and max hp", function () {
                const hp = new Hp();
                hp.set(50, 100);
                expect(hp.current).to.equal(50);
                expect(hp.max).to.equal(100);
            });

            it("Should set current hp", function () {
                const hp = new Hp();
                hp.set(50, 100);
                hp.set(75);
                expect(hp.current).to.equal(75);
                expect(hp.max).to.equal(100);
            });
        });

        describe("#current", function () {
            it("Should be 0 if set to a negative number", function () {
                const hp = new Hp();
                hp.set(-1, 100);
                expect(hp.current).to.equal(0);
            });

            it("Should be max if set to a larger number", function () {
                const hp = new Hp();
                hp.set(1000, 100);
                expect(hp.current).to.equal(100);
            });
        });

        describe("#toString()", function () {
            it("Should not display percent", function () {
                const hp = new Hp();
                expect(hp.toString()).to.equal("0/0");
            });

            it("Should display percent if given isPercent=true", function () {
                const hp = new Hp();
                expect(hp.toString(true /*isPercent*/)).to.equal("0/0%");
            });
        });
    });
