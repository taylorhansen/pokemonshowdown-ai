/**
 * @file Plays the neural network against itself for several times before
 * training and evaluation.
 *
 * The algorithm is as follows:
 * 1. Construct a neural network.
 * 2. Play the network against itself, storing (state, action, reward) tuples
 *    to disk after each decision.
 * 3. After a number of games, train a copy of the neural network using all of
 *    the saved tuples.
 * 4. Evaluate the newly trained network against the old one to see if the old
 *    one should be replaced on the next iteration. This is done by playing
 *    some number of games, each with a tiebreaker if the max turn cap is
 *    reached.
 * 5. Repeat steps 2-4 as desired.
 */
import * as tf from "@tensorflow/tfjs";
import * as fs from "fs";
import { URL } from "url";
import { Choice, choiceIds } from "../src/bot/battle/Choice";
import { Decision, Network, toColumn } from "../src/bot/battle/Network";
import { PlayerID } from "../src/bot/helpers";
import * as logger from "../src/bot/logger";
import { MessageParser } from "../src/bot/parser/MessageParser";
import { modelPath, modelsFolder } from "../src/config";
// @ts-ignore
import s = require("./Pokemon-Showdown/sim/battle-stream");

// TODO: step 4

/** Waits for a keypress to continue. Used for step debugging. */
async function keypress(): Promise<void>
{
    return new Promise<void>(resolve => process.stdin.once("data", resolve));
}

/**
 * Plays a model against itself.
 * @param model Model to self-play.
 * @param maxTurns Maximum number of turns.
 * @returns An array of Decision file URLs.
 */
async function selfPlay(model: tf.Model, maxTurns = 60): Promise<URL[]>
{
    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const urls: URL[] = [];
    const promises: Promise<void>[] = [];

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        function sender(choice: Choice): void
        {
            logger.debug(`${id} sent: ${choice}`);
            streams[id].write(choice);
        }
        // setup player
        const parser = new MessageParser();
        const listener = parser.getListener("");
        const ai = new Network(id, listener, sender);
        ai.setModel(model);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // parser event loop
        const stream = streams[id];
        promises.push(async function()
        {
            let output: string;
            for (let i = 0; i < maxTurns && (output = await stream.read()); ++i)
            {
                logger.debug(`${id} received:\n${output}`);
                try
                {
                    await parser.parse(output);
                }
                catch (e)
                {
                    logger.error(`${id}: ${e}`);
                }
                if (ai.decision) urls.push(await saveDecision(ai.decision));
                // await keypress();
            }
        }());
    }

    await Promise.all(promises);
    return urls;
}

async function play(models: {[P in PlayerID]: tf.Model}, maxTurns = 60):
    Promise<PlayerID | null>
{
    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const promises: Promise<void>[] = [];

    let winner: PlayerID | null = null;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        function sender(choice: Choice): void
        {
            logger.debug(`${id} sent: ${choice}`);
            streams[id].write(choice);
        }
        // setup player
        const parser = new MessageParser();
        const listener = parser.getListener("");
        const ai = new Network(id, listener, sender);
        ai.setModel(models[id]);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // only need one listener for this
        if (id === "p1")
        {
            listener.on("battleprogress", args => args.events.forEach(event =>
            {
                if (event.type === "win")
                {
                    logger.debug(`winner: ${event.winner}`);
                    winner = event.winner as PlayerID;
                }
            }));
        }

        // parser event loop
        const stream = streams[id];
        promises.push(async function()
        {
            let output: string;
            for (let i = 0; i < maxTurns && (output = await stream.read()); ++i)
            {
                logger.debug(`${id} received:\n${output}`);
                try
                {
                    await parser.parse(output);
                }
                catch (e)
                {
                    logger.error(`${id}: ${e}`);
                }
                // await keypress();
            }
            // FIXME: this line is never reached
            logger.debug(`done ${id}`);
        }());
    }

    await Promise.all(promises);
    return winner;
}

/** Folder to put all Decision files into. */
const datasetFolder = `${modelsFolder}/datasets`;
/** Filename counter. */
let numDatasets = 0;

/**
 * Saves a Decision object to disk.
 * @param decision Decision object to save.
 * @returns A Promise to save the object and return its file URL.
 */
async function saveDecision(decision: Decision): Promise<URL>
{
    if (!fs.existsSync(datasetFolder))
    {
        fs.mkdirSync(datasetFolder);
    }
    const path = `${datasetFolder}/${numDatasets++}.json`;
    const data = JSON.stringify(decision);
    fs.writeFileSync(path, data);
    return new URL(`file://${path}`);
}

/**
 * Compiles a model for training.
 * @param model Model to compile.
 */
function compile(model: tf.Model): void
{
    model.compile(
        {loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]});
}

/**
 * Trains a model from an array of Decision file URLs.
 * @param decisionFiles Paths to each Decision file.
 */
async function learn(model: tf.Model, decisionFiles: URL[]): Promise<tf.History>
{
    const dataset = {async iterator()
    {
        const files = [...decisionFiles];
        return {async next()
        {
            // early return: no more data
            if (files.length === 0) return {done: true, value: null as any};

            // read and delete a random Decision file
            const n = Math.floor(Math.random() * files.length);
            const url = files.splice(n, 1)[0];
            const file = fs.readFileSync(url);
            const decision: Decision = JSON.parse(file.toString());

            const state = toColumn(decision.state);

            // setup target prediction to learn from
            const prediction = model.predict(state) as tf.Tensor2D;
            const predictionData = Array.from(await prediction.data());
            predictionData[choiceIds[decision.choice]] = decision.reward;
            const target = toColumn(predictionData);

            return {done: files.length <= 0, value: [state, target]};
        }};
    }};

    return model.fitDataset(dataset, {epochs: 10});
}

/**
 * Trains and evaluates a neural network model.
 * @param model Model to train.
 * @param games Amount of games to play during self-play and evaluation.
 * @returns A new Model if it is proved to be better after self-play, or the
 * same one that's given if the new Model failed.
 */
async function train(model: tf.Model, games = 7): Promise<tf.Model>
{
    const newModel = Network.createModel();
    newModel.setWeights(model.getWeights());

    logger.debug("starting self-play");
    const decisionFiles: URL[] = [];
    for (let i = 0; i < games; ++i)
    {
        decisionFiles.push(...(await selfPlay(newModel)));
    }
    logger.debug("done with self-play");

    logger.debug("starting learning phase");
    compile(newModel);
    await learn(newModel, decisionFiles);
    logger.debug("done with learning phase");

    // challenge the old model to see if the newly trained one learned anything
    logger.debug("evaluating new network");
    const wins = {p1: 0, p2: 0};
    for (let i = 0; i < games; ++i)
    {
        const winner = await play({p1: newModel, p2: model});
        if (winner) ++wins[winner];
    }
    logger.debug("done with evaluating");
    logger.debug(`wins: ${JSON.stringify(wins)}`);
    return wins.p1 > wins.p2 ? newModel : model;
}

(async function()
{
    let model = await Network.loadModel(modelPath);
    const cycles = 1;
    for (let i = 0; i < cycles; ++i)
    {
        model = await train(model, 1);
    }
    await model.save(`file://${modelPath}`);
})();
