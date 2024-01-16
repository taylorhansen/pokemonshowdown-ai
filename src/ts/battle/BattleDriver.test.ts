import {Protocol} from "@pkmn/protocol";
import {expect} from "chai";
import "mocha";
import {Logger} from "../utils/logging/Logger";
import {Verbose} from "../utils/logging/Verbose";
import {BattleDriver} from "./BattleDriver";
import {Action} from "./agent";
import {BattleParser} from "./parser/BattleParser";
import {defaultParser, eventParser} from "./parser/utils";

export const test = () =>
    describe("BattleDriver", function () {
        const unexpectedParser: BattleParser = (ctx, event) => {
            throw new Error(`Unexpected event '${Protocol.key(event.args)}'`);
        };

        it("Should correctly manage underlying BattleParser", async function () {
            let parser = unexpectedParser;
            let requested = false;
            const driver = new BattleDriver({
                username: "username",
                // Fake BattleParser for demonstration.
                parser: async (ctx, event) => await parser(ctx, event),
                // Fake BattleAgent for demonstration.
                agent: async (state, choices) => {
                    if (requested) {
                        [choices[0], choices[1]] = [choices[1], choices[0]];
                        requested = false;
                    }
                    return await Promise.resolve();
                },
                // Fake executor for demonstration.
                sender: msg => {
                    expect(msg).to.equal("|/choose move 2");
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            parser = defaultParser("|request|");
            await driver.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            parser = unexpectedParser;
            driver.halt();
            parser = defaultParser("|start|");
            await driver.handle({args: ["start"], kwArgs: {}});
            parser = defaultParser("|turn|");
            await driver.handle({
                args: ["turn", "1" as Protocol.Num],
                kwArgs: {},
            });
            parser = eventParser("|request|", async ctx => {
                requested = true;
                const choices: Action[] = ["move 1", "move 2"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            driver.halt();
            parser = unexpectedParser;
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));

            // Turn 2.
            parser = unexpectedParser;
            await driver.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            driver.halt();
            parser = defaultParser("|turn|");
            await driver.handle({
                args: ["turn", "2" as Protocol.Num],
                kwArgs: {},
            });
            parser = eventParser("|request|", async ctx => {
                requested = true;
                const choices: Action[] = ["move 1", "move 2"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            driver.halt();
            parser = unexpectedParser;
            await new Promise<void>(res => setImmediate(res));

            // Turn 3: Game-over.
            parser = defaultParser("|tie|");
            await driver.handle({args: ["tie"], kwArgs: {}});
            parser = unexpectedParser;
            driver.halt();
            driver.finish();
        });

        it("Should handle choice rejection and retrying due to unknown info", async function () {
            let parser = unexpectedParser;
            let executorState = 0;
            const bh = new BattleDriver({
                username: "username",
                parser: async (ctx, event) => await parser(ctx, event),
                agent: async (state, choices) => {
                    void state, choices;
                    return await Promise.resolve();
                },
                sender: msg => {
                    if (executorState === 0) {
                        expect(msg).to.equal("|/choose move 1");
                    } else {
                        expect(msg).to.equal("|/choose move 2");
                    }
                    ++executorState;
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            parser = defaultParser("|request|");
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            parser = unexpectedParser;
            bh.halt();
            parser = defaultParser("|start|");
            await bh.handle({args: ["start"], kwArgs: {}});
            parser = defaultParser("|turn|");
            await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
            parser = eventParser("|request|", async ctx => {
                const choices: Action[] = ["move 1", "move 2"];
                // Try move 1.
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.true;
                // Try move 2 after move 1 was rejected.
                choices.shift();
                await ctx.agent(ctx.state, choices);
                // Move 2 was accepted.
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            bh.halt();
            parser = unexpectedParser;
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));
            expect(executorState).to.equal(1);

            // First choice is rejected.
            await bh.handle({
                args: ["error", "[Invalid choice]" as Protocol.Message],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));
            expect(executorState).to.equal(2);

            // Turn 2 after retried choice is accepted.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            parser = defaultParser("|turn|");
            await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
            parser = eventParser("|request|", async ctx => {
                const choices: Action[] = ["move 2", "move 1"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            bh.halt();
            parser = unexpectedParser;
            await new Promise<void>(res => setImmediate(res));
            expect(executorState).to.equal(3);

            // Turn 3: Game-over.
            parser = defaultParser("|tie|");
            await bh.handle({args: ["tie"], kwArgs: {}});
            parser = unexpectedParser;
            bh.halt();
            bh.finish();
            expect(executorState).to.equal(3);
        });

        it("Should handle choice rejection and retrying due to newly revealed info", async function () {
            let parser = unexpectedParser;
            let executorState = 0;
            const bh = new BattleDriver({
                username: "username",
                parser: async (ctx, event) => await parser(ctx, event),
                agent: async (state, choices) => {
                    void state, choices;
                    return await Promise.resolve();
                },
                sender: msg => {
                    if (executorState === 0) {
                        expect(msg).to.equal("|/choose move 1");
                    } else if (executorState === 1) {
                        expect(msg).to.equal("|/choose move 2");
                    } else {
                        expect(msg).to.equal("|/choose move 3");
                    }
                    ++executorState;
                    return true;
                },
                logger: new Logger(Logger.null, Verbose.None),
            });

            // Turn 1.
            parser = defaultParser("|request|");
            await bh.handle({
                args: [
                    "request",
                    // Minimal json to get the test to run.
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 1,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            parser = defaultParser("|start|");
            await bh.handle({args: ["start"], kwArgs: {}});
            parser = defaultParser("|turn|");
            await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
            parser = eventParser("|request|", async ctx => {
                const choices: Action[] = ["move 1", "move 2", "move 3"];
                // Try move 1.
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.equal(
                    "disabled",
                );
                // Move 1 is disabled, instead try move 2.
                choices.shift();
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.equal(
                    "disabled",
                );
                // Move 2 is also disabled, try final move 3.
                choices.shift();
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            bh.halt();
            parser = unexpectedParser;
            // Wait an extra tick to allow for the choice to be sent and
            // verified.
            await new Promise<void>(res => setImmediate(res));

            // First choice is rejected.
            await bh.handle({
                args: [
                    "error",
                    "[Unavailable choice] Can't move" as Protocol.Message,
                ],
                kwArgs: {},
            });
            bh.halt();
            // Agent makes new choice using updated info.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 2,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Second choice is rejected.
            await bh.handle({
                args: [
                    "error",
                    "[Unavailable choice] Can't move" as Protocol.Message,
                ],
                kwArgs: {},
            });
            bh.halt();
            // Agent makes new choice using updated info.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "move",
                        active: [{moves: [{}]}],
                        side: {
                            pokemon: [
                                {
                                    ident: "p1a: Smeargle",
                                    condition: "100/100",
                                },
                            ],
                        },
                        rqid: 3,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            await new Promise<void>(res => setImmediate(res));

            // Turn 2 after accepting retried choice.
            await bh.handle({
                args: [
                    "request",
                    JSON.stringify({
                        requestType: "wait",
                        side: undefined,
                        rqid: 4,
                    }) as Protocol.RequestJSON,
                ],
                kwArgs: {},
            });
            bh.halt();
            parser = defaultParser("|turn|");
            await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
            parser = eventParser("|request|", async ctx => {
                const choices: Action[] = ["move 3", "move 1"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.executor(choices[0])).to.eventually.be.false;
            });
            bh.halt();
            parser = unexpectedParser;
            await new Promise<void>(res => setImmediate(res));

            // Turn 3: Game-over.
            parser = defaultParser("|tie|");
            await bh.handle({args: ["tie"], kwArgs: {}});
            parser = unexpectedParser;
            bh.halt();
            bh.finish();
            expect(executorState).to.equal(4);
        });
    });
