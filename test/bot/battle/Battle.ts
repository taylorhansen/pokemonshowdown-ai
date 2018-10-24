import { expect } from "chai";
import "mocha";
import { AnyMessageListener } from "../../../src/AnyMessageListener";
import { Choice } from "../../../src/bot/battle/ai/Choice";
import { BattleState } from "../../../src/bot/battle/state/BattleState";
import * as testArgs from "../../helpers/battleTestArgs";
import { MockBattle } from "./MockBattle";

describe("Battle", function()
{
    /**
     * Adds to the responses array.
     * @param choice Response to add.
     */
    function sender(choice: Choice): void
    {
        responses.push(choice);
    }

    let responses: string[];
    let listener: AnyMessageListener;
    let state: BattleState;
    let battle: MockBattle;

    beforeEach("Initialize Battle", function()
    {
        responses = [];
        listener = new AnyMessageListener();
        state = new BattleState();
        battle = new MockBattle(testArgs.username[0], listener, sender, state);
    });

    it("Should initialize battle", function()
    {
        listener.getHandler("battleinit")(
        {
            id: "p1", username: testArgs.username[0], teamSizes: {p1: 3, p2: 3},
            gameType: "singles", gen: 4, switchIns: []
        });
        expect(battle.getSide("p1")).to.equal("us");
        expect(battle.getSide("p2")).to.equal("them");
        // setting our teamsize requires more info from a request message
        expect(state.teams.us.size).to.equal(0);
        expect(state.teams.them.size).to.equal(3);
    });

    describe("request", function()
    {
        it("Should handle request", function()
        {
            const requestArgs = testArgs.request[0];
            listener.getHandler("request")(requestArgs);
            // TODO: how to test state values?
        });

        /*it("Should handle request after setting teamsize", function()
        {
            const requestArgs: RequestArgs =
            {
                side: {name: user1, id: "p1", pokemon: []}, rqid: 1
            };
            listener.getHandler("player")(
                {id: "p2", username: user2, avatarId: 1});
            listener.getHandler("teamsize")({id: "p1", size: 2});
            listener.getHandler("request")(requestArgs);
            // TODO: how to test state values?
        });*/
    });
});
