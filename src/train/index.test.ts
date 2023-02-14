import "mocha";
import * as experienceContext from "./ExperienceContext.test";

export const test = () =>
    describe("train", function () {
        experienceContext.test();
    });
