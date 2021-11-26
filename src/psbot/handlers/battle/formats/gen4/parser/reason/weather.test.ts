import {expect} from "chai";
import "mocha";
import {BattleState} from "../../state";
import {Pokemon} from "../../state/Pokemon";
import {StateHelpers} from "../StateHelpers.test";
import * as reasonWeather from "./weather";

export const test = () =>
    describe("weather", function () {
        let state: BattleState;
        const sh = new StateHelpers(() => state);

        beforeEach("Initialize BattleState", function () {
            state = new BattleState("player1");
            state.ourSide = "p1";
        });

        describe("canActivate()", function () {
            let mon1: Pokemon;
            let mon2: Pokemon;

            beforeEach("Initialize pokemon", function () {
                mon1 = sh.initActive("p1");
                mon2 = sh.initActive("p2");
            });

            const init = (actives: readonly Pokemon[]) =>
                reasonWeather.canActivate(actives);

            it("Should return empty set if no weather-suppressant ability", function () {
                mon1.setAbility("illuminate");
                mon2.setAbility("illuminate");

                const reasons = init([mon1, mon2]);
                expect(reasons).to.not.be.null;
                expect(reasons).to.be.empty;
            });

            it("Should return null if guaranteed weather-suppressant ability", function () {
                mon1.setAbility("illuminate");
                mon2.setAbility("cloudnine");

                expect(init([mon1, mon2])).to.be.null;
            });

            it("Should return ability reason if possible to have weather-suppressant ability", function () {
                mon1.setAbility("cloudnine", "illuminate");
                mon2.setAbility("cloudnine", "illuminate");

                const reasons = init([mon1, mon2]);
                expect(reasons).to.not.be.null;
                expect(reasons).to.have.lengthOf(2);

                // Test assertions.

                const arr = [...reasons!];
                expect(arr).to.have.lengthOf(2);
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                    "illuminate",
                );
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                    "illuminate",
                );
                arr[0].assert();
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                    "illuminate",
                );
                arr[1].reject();
                expect(mon1.traits.ability.possibleValues).to.have.keys(
                    "illuminate",
                );
                expect(mon2.traits.ability.possibleValues).to.have.keys(
                    "cloudnine",
                );
            });
        });
    });
