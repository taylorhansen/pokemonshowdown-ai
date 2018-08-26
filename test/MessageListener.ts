import { expect } from "chai";
import "mocha";
import { AnyMessageListener, RoomType, ChallengesFrom } from
    "../src/bot/MessageListener";
import { PokemonID, PokemonDetails, PokemonStatus } from
    "../src/BattleState/Pokemon";

describe("AnyMessageListener", function()
{
    let listener: AnyMessageListener;

    beforeEach("Initialize AnyMessageListener", function()
    {
        listener = new AnyMessageListener();
    });

    describe("init", function()
    {
        const initTypes: RoomType[] = ["chat", "battle"];
        for (const initType of initTypes)
        {
            it(`Should handle ${initType} init message`, function(done)
            {
                listener.on("init", (type: RoomType) =>
                {
                    expect(type).to.equal(initType);
                    done();
                })
                .getHandler("init")(initType);
            });
        };
    });

    describe("updateuser", function()
    {
        it("Should handle a normal updateuser message", function(done)
        {
            const newuser = "newuser";
            const guest = true;
            listener.on("updateuser", (username: string, isGuest: boolean) =>
            {
                expect(username).to.equal(newuser);
                expect(isGuest).to.equal(guest);
                done();
            })
            .getHandler("updateuser")(newuser, guest);
        });
    });

    describe("challstr", function()
    {
        it("Should handle a normal challstr message", function(done)
        {
            const something = "something";
            listener.on("challstr", (challstr: string) =>
            {
                expect(challstr).to.equal(something);
                done();
            })
            .getHandler("challstr")(something);
        });
    });

    describe("updatechallenges", function()
    {
        it("Should handle a normal updatechallenges message", function(done)
        {
            const from: ChallengesFrom = { "newuser": "gen4ou" };
            listener.on("updatechallenges", (challengesFrom: ChallengesFrom) =>
            {
                expect(challengesFrom).to.equal(from);
                done();
            })
            .getHandler("updatechallenges")(from);
        });
    });

    describe("request", function()
    {
        it("Should handle a normal request message", function(done)
        {
            const teamInfo = {};
            listener.on("request", (team: object) =>
            {
                expect(team).to.equal(teamInfo);
                done();
            })
            .getHandler("request")(teamInfo);
        });
    });

    describe("turn", function()
    {
        it("Should handle a normal turn message", function(done)
        {
            const givenTurn = 1;
            listener.on("turn", (turn: number) =>
            {
                expect(turn).to.equal(givenTurn);
                done();
            })
            .getHandler("turn")(givenTurn);
        });
    });

    describe("error", function()
    {
        it("Should handle a normal error message", function(done)
        {
            const message = "because i said so";
            listener.on("error", (reason: string) =>
            {
                expect(reason).to.equal(message);
                done();
            })
            .getHandler("error")(message);
        });
    });

    describe("switch", function()
    {
        it("Should handle a normal switch message", function(done)
        {
            const givenId: PokemonID =
                { owner: "me", position: "b", nickname: "crazy" };
            const givenDetails: PokemonDetails =
                { species: "Magikarp", shiny: true, gender: "M", level: 100 };
            const givenStatus: PokemonStatus =
                { hp: 100, hpMax: 100, condition: "par" };
            listener.on("switch", (id: PokemonID, details: PokemonDetails,
                status: PokemonStatus) =>
            {
                expect(id).to.equal(givenId);
                expect(details).to.equal(givenDetails);
                expect(status).to.equal(givenStatus);
                done();
            })
            .getHandler("switch")(givenId, givenDetails, givenStatus);
        });
    });
});
