import { expect } from "chai";
import "mocha";
import { Pokemon } from "../../../src/battle/state/Pokemon";
import { Weather } from "../../../src/battle/state/Weather";

describe("Weather", function()
{
    let weather: Weather;
    let source: Pokemon;

    beforeEach("Initialize Weather", function()
    {
        weather = new Weather();
        source = new Pokemon(/*hpPercent*/false);
    });

    it("Should initially be reset", function()
    {
        expect(weather.type).to.equal("none");
        // tslint:disable-next-line:no-unused-expression
        expect(weather.source).to.be.undefined;
        // tslint:disable-next-line:no-unused-expression
        expect(weather.duration).to.be.null;
        expect(weather.turns).to.equal(0);
    });

    describe("reset", function()
    {
        it("Should reset weather", function()
        {
            weather.set("SunnyDay", source);
            weather.reset();
            expect(weather.type).to.equal("none");
            // tslint:disable-next-line:no-unused-expression
            expect(weather.source).to.be.undefined;
            // tslint:disable-next-line:no-unused-expression
            expect(weather.duration).to.be.null;
            expect(weather.turns).to.equal(0);
        });
    });

    describe("set", function()
    {
        it("Should set duration to 5", function()
        {
            weather.set("Hail", source);
            expect(weather.type).to.equal("Hail");
            expect(weather.source).to.equal(source);
            expect(weather.duration).to.equal(5);
            expect(weather.turns).to.equal(0);
        });

        it("Should set duration to 8 if weather rock", function()
        {
            source.item = "smoothrock";
            weather.set("Sandstorm", source);
            expect(weather.type).to.equal("Sandstorm");
            expect(weather.source).to.equal(source);
            expect(weather.duration).to.equal(8);
            expect(weather.turns).to.equal(0);
        });

        it("Should set duration to infinite if caused by ability", function()
        {
            weather.set("RainDance", source, /*ability*/true);
            expect(weather.type).to.equal("RainDance");
            expect(weather.source).to.equal(source);
            // tslint:disable-next-line:no-unused-expression
            expect(weather.duration).to.be.null;
            expect(weather.turns).to.equal(0);
        });
    });

    describe("upkeep", function()
    {
        it("Should do nothing if no weather", function()
        {
            weather.upkeep("none");
            expect(weather.type).to.equal("none");
            // tslint:disable-next-line:no-unused-expression
            expect(weather.source).to.be.undefined;
            // tslint:disable-next-line:no-unused-expression
            expect(weather.duration).to.be.null;
            expect(weather.turns).to.equal(0);
        });

        it("Should increment turns", function()
        {
            weather.set("SunnyDay", source);
            weather.upkeep("SunnyDay");
            expect(weather.type).to.equal("SunnyDay");
            expect(weather.source).to.equal(source);
            expect(weather.duration).to.equal(5);
            expect(weather.turns).to.equal(1);
        });

        it("Should never increment turn if ability-caused", function()
        {
            weather.set("SunnyDay", source, /*ability*/true);
            for (let i = 0; i < 8; ++i)
            {
                weather.upkeep("SunnyDay");
                // tslint:disable-next-line:no-unused-expression
                expect(source.item).to.be.empty;
                expect(weather.type).to.equal("SunnyDay");
                expect(weather.source).to.equal(source);
                // tslint:disable-next-line:no-unused-expression
                expect(weather.duration).to.be.null;
                expect(weather.turns).to.equal(0);
            }
        });

        it("Should infer weather rock if kept past 5 turns", function()
        {
            weather.set("SunnyDay", source);
            weather.upkeep("SunnyDay");
            let i = 1;
            do
            {
                expect(weather.type).to.equal("SunnyDay");
                expect(weather.source).to.equal(source);
                expect(weather.duration).to.equal(5);
                expect(weather.turns).to.equal(i);
                weather.upkeep("SunnyDay");
                ++i;
            }
            while (i < 5);

            // at this point, the weather has been kept past 5 turns
            expect(source.item).to.equal("heatrock");
            expect(weather.type).to.equal("SunnyDay");
            expect(weather.source).to.equal(source);
            expect(weather.duration).to.equal(8);
            expect(weather.turns).to.equal(5);
        });

        it("Should throw if upkept with different weather", function()
        {
            expect(() => weather.upkeep("Hail")).to.throw();
        });

        it(`Should throw if kept past 5 turn duration and source already has \
an item`,
        function()
        {
            weather.set("Sandstorm", source);
            source.item = "leftovers";
            for (let i = 0; i < 4; ++i) weather.upkeep("Sandstorm");
            expect(() => weather.upkeep("Sandstorm")).to.throw();
        });

        it("Should always throw if kept past 8 turn duration", function()
        {
            source.item = "damprock";
            weather.set("RainDance", source);
            for (let i = 0; i < 7; ++i) weather.upkeep("RainDance");
            expect(() => weather.upkeep("RainDance")).to.throw();
        });
    });

    describe("toArray", function()
    {
        it("Should have the same size as Weather.getArraySize()", function()
        {
            expect(weather.toArray()).to.have.lengthOf(Weather.getArraySize());
        });
    });
});
