import { expect } from "chai";
import "mocha";
import { ChallengesFrom, PlayerID, PokemonDetails, PokemonID, PokemonStatus,
    RequestData, RoomType } from "../src/parser/MessageData";
import { AnyMessageListener } from "../src/parser/MessageListener";

describe("AnyMessageListener", function()
{
    let listener: AnyMessageListener;

    beforeEach("Initialize AnyMessageListener", function()
    {
        listener = new AnyMessageListener();
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
        }
    });

    describe("player", function()
    {
        it("Should handle a normal player message", function(done)
        {
            const givenId = "p1";
            const givenUser = "somebody";
            const givenAvatar = 100;
            listener.on("player", (id: PlayerID, username: string,
                avatarId: number) =>
            {
                expect(id).to.equal(givenId);
                expect(username).to.equal(givenUser);
                expect(avatarId).to.equal(givenAvatar);
                done();
            })
            .getHandler("player")(givenId, givenUser, givenAvatar);
        });
    });

    describe("request", function()
    {
        it("Should handle a normal request message", function(done)
        {
            const teamInfo = {} as RequestData;
            listener.on("request", (team: object) =>
            {
                expect(team).to.equal(teamInfo);
                done();
            })
            .getHandler("request")(teamInfo);
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

    describe("teamsize", function()
    {
        it("Should handle a normal teamsize message", function(done)
        {
            const givenId = "p1";
            const givenSize = 1;
            listener.on("teamsize", (id: PlayerID, size: number) =>
            {
                expect(id).to.equal(givenId);
                expect(size).to.equal(givenSize);
                done();
            })
            .getHandler("teamsize")(givenId, givenSize);
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

    describe("updatechallenges", function()
    {
        it("Should handle a normal updatechallenges message", function(done)
        {
            const from: ChallengesFrom = { newuser: "gen4ou" };
            listener.on("updatechallenges", (challengesFrom: ChallengesFrom) =>
            {
                expect(challengesFrom).to.equal(from);
                done();
            })
            .getHandler("updatechallenges")(from);
        });
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

    describe("upkeep", function()
    {
        it("Should handle a normal upkeep message", function(done)
        {
            listener.on("upkeep", done).getHandler("upkeep")();
        });
    });
});
