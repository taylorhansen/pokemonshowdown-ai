import * as stream from "stream";
import {expect} from "chai";
import "mocha";
import {flattenedInputShapes} from "../model/shapes";
import {AugmentedExperience} from "../play/experience";
import {AExpDecoder} from "./decoder";
import {AExpEncoder} from "./encoder";

export const test = () =>
    describe("AExpEncoder + AExpDecoder", function () {
        it("Should encode and decode successfully", async function () {
            const aexp: AugmentedExperience = {
                action: 0,
                advantage: 2,
                probs: new Float32Array([0.1, 0.2, 0.3, 0.4]),
                returns: 1,
                state: flattenedInputShapes.map(
                    length =>
                        new Float32Array(Array.from({length}, (_, i) => i)),
                ),
                value: -0.5,
            };

            const inputStream = stream.Readable.from(
                (function* () {
                    yield aexp;
                })(),
            );
            const encoder = new AExpEncoder();
            const decoder = new AExpDecoder();
            const outputStream = new stream.Writable({
                objectMode: true,
                write(chunk: AugmentedExperience, encoding, callback) {
                    try {
                        expect(chunk).to.deep.equal(aexp);
                    } catch (e) {
                        callback(e as Error);
                        return;
                    }
                    callback();
                },
            });

            await stream.promises.pipeline(
                inputStream,
                encoder,
                decoder,
                outputStream,
            );
        });
    });
