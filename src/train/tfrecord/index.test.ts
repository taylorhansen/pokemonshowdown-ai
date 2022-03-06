import "mocha";
import * as encodeDecode from "./encode_decode.test";

export const test = () =>
    describe("tfrecord", function () {
        encodeDecode.test();
    });
