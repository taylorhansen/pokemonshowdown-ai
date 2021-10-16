import { expect } from "chai";
import "mocha";
import { BattleState } from "../state";
import { benchInfo, ditto, requestEvent, smeargle } from
    "../state/switchOptions.test";
import { createInitialContext, ParserContext, setupOverrideAgent,
    setupOverrideSender } from "./Context.test";
import { initParser, ParserHelpers, toDetails, toEffectName, toFormatName,
    toHPStatus, toID, toIdent, toMoveName, toNum, toRequestJSON, toRule,
    toUsername } from "./helpers.test";
import { main } from "./main";

export const test = () => describe("main", function()
{
    const ictx = createInitialContext();

    let state: BattleState;

    beforeEach("Extract BattleState", function()
    {
        state = ictx.getState();
    });

    let pctx: ParserContext<void> | undefined;
    const ph = new ParserHelpers(() => pctx);

    beforeEach("Initialize main BattleParser", async function()
    {
        pctx = initParser(ictx.startArgs, main);
    });

    afterEach("Close ParserContext", async function()
    {
        await ph.close().finally(() => pctx = undefined);
    });

    const {choices: agentChoices, resolve: agentResolver} =
        setupOverrideAgent(ictx);

    const {sent: sentPromise, resolve: sendResolver} =
        setupOverrideSender(ictx);

    // this is more of an integration test but hard to setup DI/mocking
    it("Should handle init/1st turn and subsequent turns until game-over",
    async function()
    {
        // note: the initial |request| event is repeated, once to initialize the
        //  team during init(), and another as the actual request for a decision
        //  after the initial switch-ins
        const req1Event = requestEvent("move", benchInfo.slice(0, 2),
        {moves: [
            {
                id: toID("tackle"), name: toMoveName("tackle"), pp: 32,
                maxpp: 32, target: "normal"
            },
            {
                id: toID("ember"), name: toMoveName("ember"), pp: 10, maxpp: 40,
                target: "normal"
            }
        ]});

        // init phase
        const team1 = state.getTeam("p1");
        expect(team1.size).to.equal(0);
        const team2 = state.getTeam("p2");
        expect(team2.size).to.equal(0);
        await ph.handle({args: ["init", "battle"], kwArgs: {}});
        await ph.handle({args: ["gametype", "singles"], kwArgs: {}});
        await ph.handle(
        {
            args: ["player", "p1", toUsername("username"), "", ""], kwArgs: {}
        });
        await ph.handle(req1Event);
        await ph.handle(
        {
            args: ["player", "p2", toUsername("player2"), "", ""], kwArgs: {}
        });
        await ph.handle({args: ["teamsize", "p1", toNum(2)], kwArgs: {}});
        await ph.handle({args: ["teamsize", "p2", toNum(2)], kwArgs: {}});
        await ph.handle({args: ["gen", 4], kwArgs: {}});
        await ph.handle({args: ["rated"], kwArgs: {}}); // ignored
        await ph.handle(
        {
            args: ["tier", toFormatName("[Gen 4] Random Battle")], kwArgs: {}
        });
        await ph.handle(
        {
            args: ["rule", toRule("Sleep Clause: Limit one foe put to sleep")],
            kwArgs: {}
        });
        await ph.handle({args: ["start"], kwArgs: {}});
        expect(team1.size).to.equal(2);
        expect(team2.size).to.equal(2);

        // turn 1: switch in smeargle on both sides
        // this is after the initial |start event parsed by init.ts

        await ph.handle(
        {
            args:
            [
                "switch", toIdent("p1", smeargle), toDetails(smeargle),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
        });
        await ph.handle(
        {
            args:
            [
                "switch", toIdent("p2", smeargle), toDetails(smeargle),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
        });
        await ph.handle({args: ["turn", toNum(1)], kwArgs: {}});

        // p1 move request
        const req1 = ph.handle(req1Event);
        await expect(agentChoices())
            .to.eventually.have.members(["move 1", "move 2", "switch 2"]);
        agentResolver();
        await expect(sentPromise()).to.eventually.equal("move 1");
        sendResolver();
        await req1;

        // turn 2: p2 switches out, p1 attacks

        await ph.handle(
        {
            args:
            [
                "switch", toIdent("p2", ditto), toDetails(ditto),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
        });
        await ph.handle(
        {
            args: ["move", toIdent("p1", smeargle), toMoveName("tackle")],
            kwArgs: {}
        });
        await ph.handle(
        {
            args: ["-damage", toIdent("p2", ditto), toHPStatus(50, 100)],
            kwArgs: {}
        });
        // residual
        await ph.handle(
        {
            args: ["-heal", toIdent("p2", ditto), toHPStatus(56, 100)],
            kwArgs: {from: toEffectName("leftovers", "item")}
        });
        await ph.handle({args: ["turn", toNum(2)], kwArgs: {}});

        // p1 move request
        const req2 = ph.handle(requestEvent("move", benchInfo.slice(0, 2),
        {moves: [
            {
                id: toID("tackle"), name: toMoveName("tackle"), pp: 31,
                maxpp: 32, target: "normal"
            },
            {
                id: toID("ember"), name: toMoveName("ember"), pp: 10, maxpp: 40,
                target: "normal"
            }
        ]}));
        await expect(agentChoices())
            .to.eventually.have.members(["move 1", "move 2", "switch 2"]);
        agentResolver();
        await expect(sentPromise()).to.eventually.equal("move 1");
        sendResolver();
        await req2;

        // turn 3: p1 attacks, p2 faints and is forced to switch

        await ph.handle(
        {
            args: ["move", toIdent("p1", smeargle), toMoveName("tackle")],
            kwArgs: {}
        });
        await ph.handle(
        {
            args: ["-damage", toIdent("p2", ditto), toHPStatus("faint")],
            kwArgs: {}
        });
        await ph.handle({args: ["faint", toIdent("p2", ditto)], kwArgs: {}});
        // p1 wait request as p2 chooses switch-in
        await ph.handle({args: ["upkeep"], kwArgs: {}});
        await ph.handle(
        {
            args:
            [
                "request",
                toRequestJSON({requestType: "wait", side: undefined, rqid: 3})
            ],
            kwArgs: {}
        });
        // p2 chose switch-in
        await ph.handle(
        {
            args:
            [
                "switch", toIdent("p2", smeargle), toDetails(smeargle),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
        });
        await ph.handle({args: ["turn", toNum(3)], kwArgs: {}});

        // p1 move request
        const req3 = ph.handle(requestEvent("move", benchInfo.slice(0, 2),
        {moves: [
            {
                id: toID("tackle"), name: toMoveName("tackle"), pp: 30,
                maxpp: 32, target: "normal"
            },
            {
                id: toID("ember"), name: toMoveName("ember"), pp: 10, maxpp: 40,
                target: "normal"
            }
        ]}));
        await expect(agentChoices())
            .to.eventually.have.members(["move 1", "move 2", "switch 2"]);
        agentResolver();
        await expect(sentPromise()).to.eventually.equal("move 1");
        sendResolver();
        await req3;

        // turn 4: p2 attacks, p1 faints and is forced to switch

        await ph.handle(
        {
            args: ["move", toIdent("p2", smeargle), toMoveName("tackle")],
            kwArgs: {}
        });
        await ph.handle(
        {
            args: ["-damage", toIdent("p1", smeargle), toHPStatus("faint")],
            kwArgs: {}
        });
        await ph.handle({args: ["faint", toIdent("p1", smeargle)], kwArgs: {}});
        // p1 chooses switch-in
        await ph.handle({args: ["upkeep"], kwArgs: {}});

        // p1 switch request
        const req4s = ph.handle(requestEvent("switch",
            [{...benchInfo[0], condition: toHPStatus("faint")}, benchInfo[1]]));
        // note: BattleAgent isn't invoked since there's only 1 switch choice
        await expect(sentPromise()).to.eventually.equal("switch 2");
        sendResolver();
        await req4s;

        // p1 chose switch-in
        await ph.handle(
        {
            args:
            [
                "switch", toIdent("p1", ditto), toDetails(ditto),
                toHPStatus(100, 100)
            ],
            kwArgs: {}
        });
        await ph.handle({args: ["turn", toNum(4)], kwArgs: {}});

        // p1 move request
        const req4 = ph.handle(requestEvent("move",
        [
            {...benchInfo[1], active: true},
            {...benchInfo[0], active: false, condition: toHPStatus("faint")}
        ],
        {moves: [
            {
                id: toID("transform"), name: toMoveName("transform"), pp: 32,
                maxpp: 32, target: "normal"
            }
        ]}));
        // note: BattleAgent isn't invoked since there's only 1 move choice
        await expect(sentPromise()).to.eventually.equal("move 1");
        sendResolver();
        await req4;

        // turn 5: p2 attacks again, p1 faints again, game over

        await ph.handle(
        {
            args: ["move", toIdent("p2", smeargle), toMoveName("tackle")],
            kwArgs: {}
        });
        await ph.handle(
        {
            args: ["-damage", toIdent("p1", ditto), toHPStatus("faint")],
            kwArgs: {}
        });
        await ph.handle({args: ["faint", toIdent("p1", ditto)], kwArgs: {}});
        await ph.handle({args: ["win", toUsername("player2")], kwArgs: {}});

        await ph.return();
    });
});
