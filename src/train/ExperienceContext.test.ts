import "mocha";
import {expect} from "chai";
import {ExperienceConfig} from "../config/types";
import {Experience} from "../game/experience";
import {intToChoice} from "../psbot/handlers/battle/agent";
import {ExperienceContext} from "./ExperienceContext";

export const test = () =>
    describe("ExperienceContext", function () {
        const baseConfig: ExperienceConfig = {
            rewardDecay: 0.9,
            steps: 1,
            bufferSize: 100,
            prefill: 100,
            metricsInterval: 0,
        };

        const exps: Experience[] = [];
        const expCallback = (exp: Experience) => void exps.push(exp);
        beforeEach("Clear experience buffer", function () {
            exps.length = 0;
        });

        const states = [
            [new Float32Array([0])],
            [new Float32Array([1])],
            [new Float32Array([2])],
            [new Float32Array([3])],
            [new Float32Array([4])],
            [new Float32Array([5])],
            [new Float32Array([6])],
        ] as const;
        const emptyChoice = new Float32Array(intToChoice.length).fill(0);
        const choices = [
            emptyChoice.slice().fill(1, 0, 1),
            emptyChoice.slice().fill(1, 1, 2),
            emptyChoice.slice().fill(1, 2, 3),
            emptyChoice.slice().fill(1, 3, 4),
            emptyChoice.slice().fill(1, 4, 5),
            emptyChoice.slice().fill(1, 5, 6),
            emptyChoice.slice().fill(1, 6, 7),
        ] as const;
        const actions = [0, 1, 2, 3, 4, 5] as const;
        const rewards = [0, 1, 2, 3, 4, 5] as const;

        it("Should be empty at first", function () {
            void new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);
        });

        it("Should throw if no action provided on next state", function () {
            const ctx = new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);

            ctx.add(states[0], choices[0]);
            expect(exps).to.have.lengthOf(0);

            expect(() => ctx.add(states[1], choices[1])).to.throw(
                Error,
                "Predict requests after first must include previous action",
            );
        });

        it("Should throw if no reward provided on next state", function () {
            const ctx = new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);

            ctx.add(states[0], choices[0]);
            expect(exps).to.have.lengthOf(0);

            expect(() => ctx.add(states[1], choices[1], rewards[0])).to.throw(
                Error,
                "Predict requests after first must include previous reward",
            );
        });

        it("Should throw if no last state on game-over", function () {
            const ctx = new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);

            expect(() => ctx.finalize(states[0])).to.throw(
                Error,
                "No last state",
            );
        });

        it("Should throw if no action provided on game-over", function () {
            const ctx = new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);

            ctx.add(states[0], choices[0]);
            expect(exps).to.have.lengthOf(0);

            expect(() => ctx.finalize(states[1])).to.throw(
                Error,
                "No last action provided",
            );
        });

        it("Should throw if no reward provided on game-over", function () {
            const ctx = new ExperienceContext(baseConfig, expCallback);
            expect(exps).to.have.lengthOf(0);

            ctx.add(states[0], choices[0]);
            expect(exps).to.have.lengthOf(0);

            expect(() => ctx.finalize(states[1], actions[0])).to.throw(
                Error,
                "No last reward provided",
            );
        });

        describe("steps = 1", function () {
            it("Should emit experience after 1st transition", function () {
                const ctx = new ExperienceContext(baseConfig, expCallback);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[0], choices[0]);
                expect(exps).to.have.lengthOf(0);

                const expectedExps: Experience[] = [];
                for (let i = 1; i < states.length; ++i) {
                    ctx.add(
                        states[i],
                        choices[i],
                        actions[i - 1],
                        rewards[i - 1],
                    );
                    expectedExps.push({
                        state: states[i - 1],
                        action: actions[i - 1],
                        reward: rewards[i - 1],
                        nextState: states[i],
                        choices: choices[i],
                        done: false,
                    });
                    expect(exps).to.have.deep.members(expectedExps);
                }
            });

            it("Should emit experience on game-over", function () {
                const ctx = new ExperienceContext(baseConfig, expCallback);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[0], choices[0]);
                expect(exps).to.have.lengthOf(0);

                ctx.finalize(states[1], actions[0], rewards[0]);
                const exp: Experience = {
                    state: states[0],
                    action: actions[0],
                    reward: rewards[0],
                    nextState: states[1],
                    choices: emptyChoice,
                    done: true,
                };
                expect(exps).to.have.deep.members([exp]);
            });

            it("Should not emit experience on forced game-over", function () {
                const ctx = new ExperienceContext(baseConfig, expCallback);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[0], choices[0]);
                expect(exps).to.have.lengthOf(0);

                ctx.finalize();
                expect(exps).to.have.lengthOf(0);
            });
        });

        describe("steps = 2", function () {
            const config: ExperienceConfig = {
                ...baseConfig,
                steps: 2,
            };

            function testExps(ctx: ExperienceContext): Experience[] {
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[0], choices[0]);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[1], choices[1], actions[0], rewards[0]);
                expect(exps).to.have.lengthOf(0);

                const expectedExps: Experience[] = [];
                for (let i = 2; i < states.length - 1; ++i) {
                    ctx.add(
                        states[i],
                        choices[i],
                        actions[i - 1],
                        rewards[i - 1],
                    );
                    expectedExps.push({
                        state: states[i - 2],
                        action: actions[i - 2],
                        reward:
                            rewards[i - 2] +
                            config.rewardDecay * rewards[i - 1],
                        nextState: states[i],
                        choices: choices[i],
                        done: false,
                    });
                    expect(exps).to.have.deep.members(expectedExps);
                }

                return expectedExps;
            }

            it("Should emit experience after 2 transitions and on game-over", function () {
                const ctx = new ExperienceContext(config, expCallback);
                const expectedExps = testExps(ctx);

                const i = states.length - 1;
                ctx.finalize(states[i], actions[i - 1], rewards[i - 1]);
                expectedExps.push(
                    {
                        state: states[i - 2],
                        action: actions[i - 2],
                        reward:
                            rewards[i - 2] +
                            config.rewardDecay * rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                    {
                        state: states[i - 1],
                        action: actions[i - 1],
                        reward: rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                );
                expect(exps).to.have.deep.members(expectedExps);
            });

            it("Should not emit experience on forced game-over", function () {
                const ctx = new ExperienceContext(config, expCallback);
                const expectedExps = testExps(ctx);

                ctx.finalize();
                expect(exps).to.have.deep.members(expectedExps);
            });
        });

        describe("steps = 4", function () {
            const config: ExperienceConfig = {
                ...baseConfig,
                steps: 4,
            };

            function testExps(ctx: ExperienceContext): Experience[] {
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[0], choices[0]);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[1], choices[1], actions[0], rewards[0]);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[2], choices[2], actions[1], rewards[1]);
                expect(exps).to.have.lengthOf(0);

                ctx.add(states[3], choices[3], actions[2], rewards[2]);
                expect(exps).to.have.lengthOf(0);

                const expectedExps: Experience[] = [];
                for (let i = 4; i < states.length - 1; ++i) {
                    ctx.add(
                        states[i],
                        choices[i],
                        actions[i - 1],
                        rewards[i - 1],
                    );
                    expectedExps.push({
                        state: states[i - 4],
                        action: actions[i - 4],
                        // N-step returns.
                        reward:
                            rewards[i - 4] +
                            config.rewardDecay * rewards[i - 3] +
                            config.rewardDecay ** 2 * rewards[i - 2] +
                            config.rewardDecay ** 3 * rewards[i - 1],
                        nextState: states[i],
                        choices: choices[i],
                        done: false,
                    });
                    expect(exps).to.have.deep.members(expectedExps);
                }

                return expectedExps;
            }

            it("Should emit experience after 4 transitions and on game-over", function () {
                const ctx = new ExperienceContext(config, expCallback);
                const expectedExps = testExps(ctx);

                const i = states.length - 1;
                ctx.finalize(states[i], actions[i - 1], rewards[i - 1]);
                expectedExps.push(
                    {
                        state: states[i - 4],
                        action: actions[i - 4],
                        reward:
                            rewards[i - 4] +
                            config.rewardDecay * rewards[i - 3] +
                            config.rewardDecay ** 2 * rewards[i - 2] +
                            config.rewardDecay ** 3 * rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                    {
                        state: states[i - 3],
                        action: actions[i - 3],
                        reward:
                            rewards[i - 3] +
                            config.rewardDecay * rewards[i - 2] +
                            config.rewardDecay ** 2 * rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                    {
                        state: states[i - 2],
                        action: actions[i - 2],
                        reward:
                            rewards[i - 2] +
                            config.rewardDecay * rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                    {
                        state: states[i - 1],
                        action: actions[i - 1],
                        reward: rewards[i - 1],
                        nextState: states[i],
                        choices: emptyChoice,
                        done: true,
                    },
                );
                expect(exps).to.have.deep.members(expectedExps);
            });

            it("Should not emit experience on forced game-over", function () {
                const ctx = new ExperienceContext(config, expCallback);
                const expectedExps = testExps(ctx);

                ctx.finalize();
                expect(exps).to.have.deep.members(expectedExps);
            });
        });
    });
