import "mocha";
import {expect} from "chai";
import {BattleState} from "../../state";
import {SwitchOptions} from "../../state/Team";
import {allocEncodedState, encodeState} from "./encodeState";
import {flattenedInputShapes, modelInputNames, totalInputSize} from "./shapes";

const switchOptions: SwitchOptions = {
    species: "magikarp",
    level: 100,
    gender: "M",
    hp: 200,
    hpMax: 200,
};

export const test = () =>
    describe("encodeState", function () {
        describe("allocEncodedState()", function () {
            it("Should allocate the correct amount of memory", function () {
                const {data, original} = allocEncodedState("unsafe");
                expect(data.map(a => a.length)).to.deep.equal(
                    flattenedInputShapes,
                );
                expect(original).to.have.lengthOf(totalInputSize);
                for (const arr of data) {
                    expect(arr.buffer).to.equal(
                        original.buffer,
                        "Not sharing buffers!",
                    );
                }
            });
        });

        describe("encodeState()", function () {
            it("Should encode battle state", function () {
                const state = new BattleState("username");
                state.ourSide = "p2";
                state.teams.p1!.size = 2;
                state.teams.p1!.switchIn(switchOptions);
                state.teams.p2!.size = 2;
                state.teams.p2!.switchIn(switchOptions);

                // Fill input data arrays with NaN so we can later check that
                // they're filled with valid data.
                const {data, original} = allocEncodedState("unsafe");
                original.fill(NaN);

                encodeState(data, state);
                expect(data.map(a => a.length)).to.deep.equal(
                    flattenedInputShapes,
                );
                for (let i = 0; i < data.length; ++i) {
                    const arr = data[i];
                    for (let j = 0; j < arr.length; ++j) {
                        expect(
                            arr[j],
                            `Array ${i} (${modelInputNames[i]}) contains NaN ` +
                                `at index ${j}`,
                        ).to.not.be.NaN;
                        expect(arr[j]).to.be.within(
                            -1,
                            1,
                            `Array ${i} (${modelInputNames[i]}) contains an ` +
                                `invalid value ${arr[j]} at index ${j}`,
                        );
                    }
                }
            });
        });
    });
