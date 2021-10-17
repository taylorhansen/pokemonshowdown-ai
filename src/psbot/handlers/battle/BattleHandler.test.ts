import { Protocol } from "@pkmn/protocol";
import { expect } from "chai";
import "mocha";
import { formats } from ".";
import { Choice } from "./agent";
import { BattleHandler } from "./BattleHandler";
import { consume, verify } from "./parser";

export const test = () => describe("BattleHandler", function()
{
    it("Should correctly manage underlying BattleParser", async function()
    {
        const bh = new BattleHandler(
        {
            format: "gen4", username: "username",
            // fake BattleParser for demonstration
            async parser(ctx)
            {
                await verify(ctx, "|start|");
                await consume(ctx);

                await verify(ctx, "|turn|");
                await consume(ctx);

                await verify(ctx, "|request|");
                (ctx.state as any).requested = true;
                const choices: Choice[] = ["move 1", "move 2"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.sender(choices[0])).to.eventually.be.undefined;
                await consume(ctx);

                await verify(ctx, "|turn|");
                await consume(ctx);

                await verify(ctx, "|tie|");
                await consume(ctx);
            },
            // fake BattleState for demonstration
            stateCtor: class
            {
                // @ts-expect-error
                private requested = false;
                constructor(public readonly username: string) {}
            } as any as formats.StateConstructor<"gen4">,
            // fake BattleAgent for demonstration
            async agent(state, choices)
            {
                if ((state as any).requested)
                {
                    [choices[0], choices[1]] = [choices[1], choices[0]];
                }
            },
            // fake Sender for demonstration
            sender(msg)
            {
                expect(msg).to.equal("|/choose move 2");
                return true;
            }
        });

        // turn 1
        await bh.handle({args: ["start"], kwArgs: {}});
        await bh.handle(
        {
            args:
            [
                "request",
                JSON.stringify(
                        {requestType: "wait", side: undefined, rqid: 1}) as
                    Protocol.RequestJSON
            ],
            kwArgs: {}
        });
        await bh.handle({args: ["turn", "1" as Protocol.Num], kwArgs: {}});
        bh.halt();
        // wait an extra tick to allow for the choice to be sent and verified
        await new Promise<void>(res => setImmediate(res));

        // turn 2: game-over
        await bh.handle({args: ["turn", "2" as Protocol.Num], kwArgs: {}});
        await bh.handle({args: ["tie"], kwArgs: {}});
        bh.halt();
        await bh.finish();
    });

    it("Should handle choice rejection and retrying due to unknown info",
    async function()
    {
        let senderState = 0;
        const bh = new BattleHandler(
        {
            format: "gen4", username: "username",
            async parser(ctx)
            {
                await verify(ctx, "|start|");
                await consume(ctx);

                await verify(ctx, "|request|");
                const choices: Choice[] = ["move 1", "move 2"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.sender(choices[0])).to.eventually.be.true;
                await expect(ctx.sender(choices[1])).to.eventually.be.undefined;
                await consume(ctx);

                await verify(ctx, "|tie|");
                await consume(ctx);
            },
            stateCtor:
                class { constructor(public readonly username: string) {} } as
                    any as formats.StateConstructor<"gen4">,
            async agent(state, choices)
            {
                [choices[0], choices[1]] = [choices[1], choices[0]];
            },
            sender(msg)
            {
                if (senderState === 0) expect(msg).to.equal("|/choose move 2");
                else expect(msg).to.equal("|/choose move 1");
                ++senderState;
                return true;
            }
        });

        // turn 1
        await bh.handle({args: ["start"], kwArgs: {}});
        await bh.handle(
        {
            args:
            [
                "request",
                JSON.stringify(
                        {requestType: "wait", side: undefined, rqid: 1}) as
                    Protocol.RequestJSON
            ],
            kwArgs: {}
        });
        bh.halt();
        // wait an extra tick to allow for the choice to be sent and verified
        await new Promise<void>(res => setImmediate(res));

        // first choice is rejected
        await bh.handle(
        {
            args: ["error", "[Invalid choice]" as Protocol.Message], kwArgs: {}
        });
        await new Promise<void>(res => setImmediate(res));

        // turn 2: game-over
        await bh.handle({args: ["tie"], kwArgs: {}});
        bh.halt();
        await bh.finish();
        expect(senderState).to.equal(2);
    });

    it("Should handle choice rejection and retrying due to newly revealed " +
        "info", async function()
    {
        let senderState = 0;
        const bh = new BattleHandler(
        {
            format: "gen4", username: "username",
            async parser(ctx)
            {
                await verify(ctx, "|start|");
                await consume(ctx);

                await verify(ctx, "|request|");
                const choices: Choice[] = ["move 1", "move 2"];
                await ctx.agent(ctx.state, choices);
                await expect(ctx.sender(choices[0]))
                    .to.eventually.equal("disabled");
                await ctx.agent(ctx.state, choices);
                await expect(ctx.sender(choices[0])).to.eventually.be.undefined;
                await consume(ctx);

                await verify(ctx, "|tie|");
                await consume(ctx);
            },
            stateCtor:
                class { constructor(public readonly username: string) {} } as
                    any as formats.StateConstructor<"gen4">,
            async agent(state, choices)
            {
                [choices[0], choices[1]] = [choices[1], choices[0]];
            },
            sender(msg)
            {
                if (senderState === 0) expect(msg).to.equal("|/choose move 2");
                else expect(msg).to.equal("|/choose move 1");
                ++senderState;
                return true;
            }
        });

        // turn 1
        await bh.handle({args: ["start"], kwArgs: {}});
        await bh.handle(
        {
            args:
            [
                "request",
                JSON.stringify(
                        {requestType: "wait", side: undefined, rqid: 1}) as
                    Protocol.RequestJSON
            ],
            kwArgs: {}
        });
        bh.halt();
        // wait an extra tick to allow for the choice to be sent and verified
        await new Promise<void>(res => setImmediate(res));

        // first choice is rejected
        await bh.handle(
        {
            args:
            [
                "error", "[Unavailable choice] Can't move" as Protocol.Message
            ],
            kwArgs: {}
        });
        // agent makes new choice using updated info
        await bh.handle(
        {
            args:
            [
                "request",
                // minimal json to get the test to run
                JSON.stringify(
                {
                    requestType: "move", active: [{moves: [{}]}],
                    side:
                    {
                        pokemon:
                            [{ident: "p1a: Smeargle", condition: "100/100"}]
                    },
                    rqid: 2
                }) as Protocol.RequestJSON
            ],
            kwArgs: {}
        });
        await new Promise<void>(res => setImmediate(res));

        // turn 2: game-over
        await bh.handle({args: ["tie"], kwArgs: {}});
        bh.halt();
        await bh.finish();
        expect(senderState).to.equal(2);
    });
});
