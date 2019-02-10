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
import * as ProgressBar from "progress";
import { URL } from "url";
import { Choice, choiceIds } from "../src/bot/battle/Choice";
import { Decision, Network, toColumn } from "../src/bot/battle/Network";
import { PlayerID } from "../src/bot/helpers";
import { MessageParser } from "../src/bot/parser/MessageParser";
import { logsFolder, modelPath, modelsFolder } from "../src/config";
import { Logger } from "../src/Logger";
// @ts-ignore
import s = require("./Pokemon-Showdown/sim/battle-stream");

/** Main logger for top-level. */
const logger = Logger.stdout;
/** Maximum number of turns in a game before it's considered a tie. */
const maxTurns = 100;

/**
 * Plays a model against itself.
 * @param model Model to self-play.
 * @param logPath Path to store debug info.
 * @returns An array of Decision file URLs.
 */
async function selfPlay(model: tf.Model, logPath?: string): Promise<URL[]>
{
    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const urls: URL[] = [];
    const promises: Promise<void>[] = [];

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        function sender(choice: Choice): void
        {
            streams[id].write(choice);
        }

        let file: fs.WriteStream | undefined;
        let innerLog: Logger;
        if (logPath)
        {
            file = fs.createWriteStream(logPath);
            innerLog = new Logger(file, id + ": ");
        }
        else innerLog = Logger.null;

        // setup player
        const parser = new MessageParser(innerLog);
        const listener = parser.getListener("");
        const ai = new Network(id, listener, sender, innerLog);
        ai.setModel(model);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // parser event loop
        const stream = streams[id];
        promises.push(async function()
        {
            let output: string;
            for (let i = 0; i < maxTurns && (output = await stream.read()); ++i)
            {
                innerLog.debug(`received:\n${output}`);
                try
                {
                    await parser.parse(output);
                }
                catch (e)
                {
                    logger.error(`${id}: ${e}`);
                }
                if (ai.decision) urls.push(await saveDecision(ai.decision));
            }
            if (file) file.close();
        }());
    }

    await Promise.all(promises);
    return urls;
}

/**
 * Pits two models against each other.
 * @param models Neural network models to represent p1 and p2.
 * @param logPath Path to store debug info.
 * @returns The PlayerID of the winner, or null if tied.
 */
async function play(models: {[P in PlayerID]: tf.Model}, logPath?: string):
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
            streams[id].write(choice);
        }

        let file: fs.WriteStream | undefined;
        let innerLog: Logger;
        if (logPath)
        {
            file = fs.createWriteStream(logPath);
            innerLog = new Logger(file, id + ": ");
        }
        else innerLog = Logger.null;

        // setup player
        const parser = new MessageParser(innerLog);
        const listener = parser.getListener("");
        const ai = new Network(id, listener, sender, innerLog);
        ai.setModel(models[id]);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // only need one listener for this
        if (id === "p1")
        {
            listener.on("battleprogress", args => args.events.forEach(event =>
            {
                if (event.type === "win") winner = event.winner as PlayerID;
            }));
        }

        // parser event loop
        const stream = streams[id];
        promises.push(async function()
        {
            let output: string;
            for (let i = 0; i < maxTurns && (output = await stream.read()); ++i)
            {
                innerLog.debug(`received:\n${output}`);
                try
                {
                    await parser.parse(output);
                }
                catch (e)
                {
                    logger.error(`${id}: ${e}`);
                }
            }
            if (file) file.close();
        }());
    }

    await Promise.all(promises);
    return winner;
}

/** Folder to put all Decision files into. */
const datasetFolder = `${modelsFolder}/datasets`;
/** Decision filename counter. */
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
async function train(model: tf.Model, games = 5): Promise<tf.Model>
{
    const newModel = Network.createModel();
    newModel.setWeights(model.getWeights());

    logger.log("beginning self-play");
    const decisionFiles: URL[] = [];
    let bar = new ProgressBar("self-play games: [:bar] :current/:total",
        {total: games, stream: logger.stream});
    bar.update(0);
    for (let i = 0; i < games; ++i)
    {
        decisionFiles.push(...(await selfPlay(newModel,
            `${logsFolder}/self-play/game-${i + 1}`)));
        bar.tick();
    }

    logger.log("learning (this may take a while)");
    compile(newModel);
    await learn(newModel, decisionFiles);

    // challenge the old model to see if the newly trained one learned anything
    logger.log("evaluating new network (p1=new, p2=old)");
    const wins = {p1: 0, p2: 0};
    bar = new ProgressBar("evaluation games: [:bar] :current/:total",
        {total: games, stream: logger.stream});
    bar.update(0);
    for (let i = 0; i < games; ++i)
    {
        const winner = await play({p1: newModel, p2: model},
            `${logsFolder}/evaluate/game-${i + 1}`);
        if (winner)
        {
            ++wins[winner];
            bar.interrupt(`game ${i + 1}: ${winner}`);
        }
        else bar.interrupt(`game ${i + 1}: tie`);
        bar.tick();
    }
    logger.debug("done with evaluating");
    logger.debug(`wins: ${JSON.stringify(wins)}`);
    if (wins.p1 > wins.p2)
    {
        logger.debug("new model wins");
        return newModel;
    }
    logger.debug("old model not replaced");
    return model;
}

(async function()
{
    let model = await Network.loadModel(modelPath);
    const cycles = 1;
    for (let i = 0; i < cycles; ++i)
    {
        logger.log(`TRAINING CYCLE ${i + 1}/${cycles}:`);
        model = await train(model);
    }
    await model.save(`file://${modelPath}`);
})();
