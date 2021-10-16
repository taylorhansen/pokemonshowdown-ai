import { expect } from "chai";
import "mocha";
import { BattleState } from "../state";
import { benchInfo, ditto, eevee, requestEvent, smeargle } from
    "../state/switchOptions.test";
import { createInitialContext, ParserContext, setupOverrideSender } from
    "./Context.test";
import * as faint from "./faint";
import { ParserHelpers, setupBattleParser, toDetails, toEffectName, toHPStatus,
    toIdent, toMoveName, toRequestJSON, toUsername } from "./helpers.test";

export const test = () => describe("faint", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    const {sent: sentPromise, resolve: sendResolver} =
        setupOverrideSender(ictx);

    describe("event()", function()
    {
        const init = setupBattleParser(ictx.startArgs, faint.event);
        let pctx: ParserContext<void> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should handle faint event if pokemon has 0 hp", async function()
        {
            sh.initActive("p1").faint();

            pctx = init("p1");
            await ph.handle({args: ["faint", toIdent("p1")], kwArgs: {}});
            await ph.return();
        });

        it("Should reject if mismatched ident", async function()
        {
            sh.initActive("p2").faint();

            pctx = init("p2");
            await ph.reject({args: ["faint", toIdent("p1")], kwArgs: {}});
        });

        it("Should return if pokemon isn't fainted", async function()
        {
            sh.initActive("p1").faint();
            sh.initActive("p2");

            pctx = init("p2");
            await ph.return();
        });
    });

    describe("replacements()", function()
    {
        const init = setupBattleParser(ictx.startArgs, faint.replacements);
        let pctx: ParserContext<void> | undefined;
        const ph = new ParserHelpers(() => pctx);

        afterEach("Close ParserContext", async function()
        {
            await ph.close().finally(() => pctx = undefined);
        });

        it("Should wait for opponent's switch-in if fainted", async function()
        {
            sh.initActive("p1");
            sh.initTeam("p2", [undefined, smeargle])[0].faint();

            pctx = init();
            await ph.handle(
            {
                args:
                [
                    "request",
                    toRequestJSON(
                        {requestType: "wait", side: undefined, rqid: 2})
                ],
                kwArgs: {}
            });
            await ph.handle(
            {
                args:
                [
                    "switch", toIdent("p2", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });

        it("Should wait for client's switch-in if fainted", async function()
        {
            sh.initTeam("p1", [ditto, smeargle])[1].faint();
            sh.initActive("p2");

            pctx = init();
            const p = ph.handle(requestEvent("switch",
            [
                {...benchInfo[0], condition: toHPStatus("faint")}, benchInfo[1]
            ]));
            // only 1 choice is available so no need to call agent
            await expect(sentPromise()).to.eventually.equal("switch 2");
            sendResolver();
            await p;
            await ph.handle(
            {
                args:
                [
                    "switch", toIdent("p1", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });

        it("Should also wait for client's switch-in if both fainted",
        async function()
        {
            sh.initTeam("p1", [ditto, smeargle])[1].faint();
            sh.initTeam("p2", [undefined, smeargle])[0].faint();

            pctx = init();
            const p = ph.handle(requestEvent("switch",
            [
                {...benchInfo[0], condition: toHPStatus("faint")}, benchInfo[1]
            ]));
            // only 1 choice is available so no need to call agent
            await expect(sentPromise()).to.eventually.equal("switch 2");
            sendResolver();
            await p;
            await ph.handle(
            {
                args:
                [
                    "switch", toIdent("p2", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.handle(
            {
                args:
                [
                    "switch", toIdent("p1", ditto), toDetails(ditto),
                    toHPStatus(100)
                ],
                kwArgs: {}
            });
            await ph.halt();
            await ph.return();
        });

        it("Should return if no fainted", async function()
        {
            sh.initActive("p1");
            sh.initActive("p2");

            pctx = init();
            await ph.return();
        });

        it("Should return if p1 fainted but only looking for p2",
        async function()
        {
            sh.initActive("p1").faint();
            sh.initActive("p2");

            pctx = init(["p2"]);
            await ph.return();
        });

        it("Should handle chained faint replacements", async function()
        {
            sh.initActive("p1");
            const [mon3, mon2, mon1] =
                sh.initTeam("p2", [eevee, ditto, smeargle]);
            mon1.faint();
            mon2.hp.set(1);
            mon3.hp.set(1);
            const team = state.getTeam("p2");
            team.status.spikes = 3;

            pctx = init();
            // first replacement sent in
            await ph.handle(
            {
                args:
                [
                    "request",
                    toRequestJSON(
                        {requestType: "wait", side: undefined, rqid: 2})
                ],
                kwArgs: {}
            });
            await ph.handle(
            {
                args:
                [
                    "switch",
                    toIdent("p2", ditto), toDetails(ditto), toHPStatus(100)
                ],
                kwArgs: {}
            });
            // first replacement faints
            await ph.handle(
            {
                args: ["-damage", toIdent("p2", ditto), toHPStatus("faint")],
                kwArgs: {from: toMoveName("spikes")}
            });
            await ph.handle(
                {args: ["faint", toIdent("p2", ditto)], kwArgs: {}});
            // second replacement sent in
            await ph.handle(
            {
                args:
                [
                    "request",
                    toRequestJSON(
                        {requestType: "wait", side: undefined, rqid: 2})
                ],
                kwArgs: {}
            });
            await ph.handle(
            {
                args:
                [
                    "switch",
                    toIdent("p2", eevee), toDetails(eevee), toHPStatus(100)
                ],
                kwArgs: {}
            });
            // second replacement faints
            await ph.handle(
            {
                args: ["-damage", toIdent("p2", eevee), toHPStatus("faint")],
                kwArgs: {from: toMoveName("spikes")}
            });
            await ph.handle(
                {args: ["faint", toIdent("p2", eevee)], kwArgs: {}});
            // game-over state detected
            // this parser doesn't actually consume the event though, it just
            //  verifies it and leaves it to the top-level turnLoop parser to
            //  officially handle
            await ph.reject(
                {args: ["win", toUsername("username")], kwArgs: {}});
            await ph.return();
        });
    });
});
