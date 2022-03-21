import * as stream from "stream";
import {expect} from "chai";
import "mocha";
import {flattenedInputShapes} from "../model/shapes";
import {TrainingExample} from "../play/experience";
import {TrainingExampleDecoder} from "./decoder";
import {TrainingExampleEncoder} from "./encoder";

export const test = () =>
    describe("TrainingExampleEncoder + TrainingExampleDecoder", function () {
        const testExample1: TrainingExample = {
            state: flattenedInputShapes.map(
                length => new Float32Array(Array.from({length}, (_, i) => i)),
            ),
            action: 0,
            returns: 1,
        };

        it("Should encode/decode one example", async function () {
            const examples: TrainingExample[] = [];
            await stream.promises.pipeline(
                [testExample1],
                new TrainingExampleEncoder(),
                new TrainingExampleDecoder(),
                async function (source) {
                    for await (const chunk of source) {
                        examples.push(chunk as TrainingExample);
                    }
                },
            );
            expect(examples).to.have.lengthOf(1);
            expect(examples[0]).to.deep.equal(testExample1);
        });

        const testExample2: TrainingExample = {
            state: flattenedInputShapes.map(
                length =>
                    new Float32Array(
                        Array.from({length}, (_, i) => -1 / (i + 1)),
                    ),
            ),
            action: 1,
            returns: -0.25,
        };

        it("Should encode/decode multiple examples", async function () {
            const examples: TrainingExample[] = [];
            await stream.promises.pipeline(
                [testExample1, testExample2],
                new TrainingExampleEncoder(),
                new TrainingExampleDecoder(),
                async function (source) {
                    for await (const chunk of source) {
                        examples.push(chunk as TrainingExample);
                    }
                },
            );
            expect(examples).to.have.lengthOf(2);
            expect(examples[0]).to.deep.equal(testExample1);
            expect(examples[1]).to.deep.equal(testExample2);
        });
    });
