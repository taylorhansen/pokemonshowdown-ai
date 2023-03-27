import "mocha";
import * as experienceContext from "./ExperienceContext.test";

export const test = () =>
    describe("experience", function () {
        experienceContext.test();
    });
