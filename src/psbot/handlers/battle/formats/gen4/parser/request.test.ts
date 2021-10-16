import { expect } from "chai";
import "mocha";
import { BattleState } from "../state";
import { benchInfo, ditto, eevee, requestEvent, smeargle } from
    "../state/switchOptions.test";
import { createInitialContext, ParserContext, setupOverrideAgent,
    setupOverrideSender } from "./Context.test";
import { initParser, ParserHelpers, toID, toMoveName, toRequestJSON,
    toUsername } from "./helpers.test";
import { request } from "./request";

export const test = () => describe("request", function()
{
    const ictx = createInitialContext();
    const {sh} = ictx;

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    let pctx: ParserContext<void> | undefined;
    const ph = new ParserHelpers(() => pctx);

    beforeEach("Initialize request BattleParser", async function()
    {
        pctx = initParser(ictx.startArgs, request);
    });

    afterEach("Close ParserContext", async function()
    {
        await ph.close().finally(() => pctx = undefined);
    });

    const {choices: agentChoices, resolve: agentResolver} =
        setupOverrideAgent(ictx);

    const {sent: sentPromise, resolve: sendResolver} =
        setupOverrideSender(ictx);

    describe("requestType = team", function()
    {
        it("Should throw", async function()
        {
            await ph.rejectError(
            {
                args:
                [
                    "request",
                    toRequestJSON(
                    {
                        requestType: "team",
                        side:
                        {
                            id: "p1", name: toUsername("username"), pokemon: []
                        },
                        rqid: 1
                    })
                ],
                kwArgs: {}
            },
                Error, "Team preview not supported");
        });
    });

    describe("requestType = move", function()
    {
        it("Should update moves and send choice", async function()
        {
            const [, , mon] = sh.initTeam("p1", [eevee, ditto, smeargle]);
            expect(mon.moveset.reveal("ember").pp).to.equal(40);
            expect(mon.moveset.get("tackle")).to.be.null;

            const p = ph.handle(requestEvent("move",
            [
                {...benchInfo[0], moves: [toID("tackle"), toID("ember")]},
                ...benchInfo.slice(1)
            ],
            {moves: [
                {
                    id: toID("tackle"), name: toMoveName("tackle"), pp: 32,
                    maxpp: 32, target: "normal"
                },
                {
                    id: toID("ember"), name: toMoveName("ember"), pp: 10,
                    maxpp: 40, target: "normal"
                }
            ]}));

            await expect(agentChoices()).to.eventually.have.members(
                ["move 1", "move 2", "switch 2", "switch 3"]);
            agentResolver();
            await expect(sentPromise()).to.eventually.equal("move 1");
            sendResolver();

            await p;
            await ph.return();
            expect(mon.moveset.get("ember")!.pp).to.equal(10);
            expect(mon.moveset.get("tackle")).to.not.be.null;
        });

        it("Should handle switch rejection via trapping ability",
        async function()
        {
            sh.initTeam("p1", [eevee, ditto, smeargle]);

            const mon = sh.initActive("p2");
            mon.setAbility("shadowtag", "illuminate");

            const p = ph.handle(requestEvent("move", benchInfo,
            {moves: [
                {
                    id: toID("tackle"), name: toMoveName("tackle"), pp: 32,
                    maxpp: 32, target: "normal"
                },
                {
                    id: toID("ember"), name: toMoveName("ember"), pp: 10,
                    maxpp: 40, target: "normal"
                }
            ]}));

            // make a switch choice
            const c = await agentChoices();
            expect(c).to.have.members(
                ["move 1", "move 2", "switch 2", "switch 3"]);
            [c[2], c[0]] = [c[0], c[2]];
            expect(c).to.have.members(
                ["switch 2", "move 2", "move 1", "switch 3"]);
            expect(agentResolver).to.not.be.null;
            agentResolver!();
            // switch choice was rejected due to a trapping ability
            await expect(sentPromise()).to.eventually.equal("switch 2");
            sendResolver("trapped");

            // make a new choice
            await expect(agentChoices()).to.eventually.have.members(
                ["move 2", "move 1"]);
            agentResolver();
            // switch choice was accepted now
            await expect(sentPromise()).to.eventually.equal("move 2");
            sendResolver();

            await p;
            await ph.return();
            expect(mon.traits.ability.possibleValues).to.have.keys("shadowtag");
        });
    });

    describe("requestType = switch", function()
    {
        it("Should consider only switch choices", async function()
        {
            sh.initTeam("p1", [eevee, ditto, smeargle]);

            const p = ph.handle(requestEvent("switch", benchInfo));

            await expect(agentChoices()).to.eventually.have.members(
                ["switch 2", "switch 3"]);
            agentResolver();
            await expect(sentPromise()).to.eventually.equal("switch 2");
            sendResolver();

            await p;
            await ph.return();
        });
    });

    describe("requestType = wait", function()
    {
        it("Should do nothing", async function()
        {
            await ph.handle(
            {
                args:
                [
                    "request",
                    toRequestJSON(
                        {requestType: "wait", side: undefined, rqid: 5})
                ],
                kwArgs: {}
            });
            await ph.return();
        });
    });
});
