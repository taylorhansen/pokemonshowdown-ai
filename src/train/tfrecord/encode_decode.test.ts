import * as stream from "stream";
import {expect} from "chai";
import "mocha";
import {flattenedInputShapes} from "../model/shapes";
import {AugmentedExperience} from "../play/experience";
import {AExpDecoder} from "./decoder";
import {AExpEncoder} from "./encoder";

export const test = () =>
    describe("AExpEncoder + AExpDecoder", function () {
        const testAexp1: AugmentedExperience = {
            action: 0,
            advantage: -1,
            probs: new Float32Array([0.1, 0.2, 0.3, 0.4]),
            returns: 1,
            state: flattenedInputShapes.map(
                length => new Float32Array(Array.from({length}, (_, i) => i)),
            ),
            value: -0.5,
        };

        it("Should encode/decode one aexp", async function () {
            const aexps: AugmentedExperience[] = [];
            await stream.promises.pipeline(
                [testAexp1],
                new AExpEncoder(),
                new AExpDecoder(),
                async function (source) {
                    for await (const chunk of source) {
                        aexps.push(chunk as AugmentedExperience);
                    }
                },
            );
            expect(aexps).to.have.lengthOf(1);
            expect(aexps[0]).to.deep.equal(testAexp1);
        });

        const testAexp2: AugmentedExperience = {
            action: 1,
            advantage: 0.5,
            probs: new Float32Array([0.4, 0.3, 0.3]),
            returns: -0.25,
            state: flattenedInputShapes.map(
                length =>
                    new Float32Array(
                        Array.from({length}, (_, i) => -1 / (i + 1)),
                    ),
            ),
            value: 0.75,
        };

        it("Should encode/decode multiple aexps", async function () {
            const aexps: AugmentedExperience[] = [];
            await stream.promises.pipeline(
                [testAexp1, testAexp2],
                new AExpEncoder(),
                new AExpDecoder(),
                async function (source) {
                    for await (const chunk of source) {
                        aexps.push(chunk as AugmentedExperience);
                    }
                },
            );
            expect(aexps).to.have.lengthOf(2);
            expect(aexps[0]).to.deep.equal(testAexp1);
            expect(aexps[1]).to.deep.equal(testAexp2);
        });
    });
