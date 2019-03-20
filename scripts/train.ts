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
import { dirname } from "path";
import * as ProgressBar from "progress";
import { URL } from "url";
import { Choice, choiceIds } from "../src/bot/battle/Choice";
import { Decision, Network, toColumn } from "../src/bot/battle/Network";
import { PlayerID } from "../src/bot/helpers";
import { MessageParser } from "../src/bot/parser/MessageParser";
import { evaluateFolder, modelPath, modelsFolder, selfPlayFolder } from
    "../src/config";
import { Logger } from "../src/Logger";
// @ts-ignore
import s = require("./Pokemon-Showdown/.sim-dist/battle-stream");

/** Main logger for top-level. */
const logger = Logger.stdout;
/** Maximum number of turns in a game before it's considered a tie. */
const maxTurns = 100;

/** Options for starting a new game. */
interface GameOptions
{
    /**
     * Whether to save Decision objects to disk, which will be used for learning
     * later.
     */
    saveDecisions: boolean;
}

/** Result object returned from `play()`. */
interface GameResult
{
    /**
     * URLs to saved Decision objects. Empty if `options.saveDecisions` was
     * false.
     */
    decisions: URL[];
    /** The winner of the game. Null if tied. */
    winner: PlayerID | null;
}

/**
 * Pits two models against each other.
 * @param models Neural network models to represent p1 and p2.
 * @param options Game options.
 * @param logPath Path to the file in which to store debug info.
 * @returns A Promise to compute the result of the game.
 */
async function play(models: {[P in PlayerID]: tf.Model},
    options: GameOptions, logPath?: string): Promise<GameResult>
{
    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    const result: GameResult = {decisions: [], winner: null};
    const promises: Promise<void>[] = [];

    // setup log file
    let file: fs.WriteStream | undefined;
    if (logPath)
    {
        const dir = dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});

        file = fs.createWriteStream(logPath);
    }

    let done = false;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        // sends player choices to the battle stream
        function sender(choice: Choice): void
        {
            streams[id].write(choice);
        }

        // setup logger
        let innerLog: Logger;
        if (file) innerLog = new Logger(file, id + ": ");
        else innerLog = Logger.null;

        // setup player
        const parser = new MessageParser(innerLog);
        const listener = parser.getListener("");
        const ai = new Network(id, listener, sender, innerLog);
        ai.setModel(models[id]);
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // setup callbacks
        let perTurn: () => void | Promise<void>;
        if (options.saveDecisions)
        {
            perTurn = async () =>
            {
                if (ai.decision)
                {
                    result.decisions.push(await saveDecision(ai.decision));
                }
            };
        }
        else perTurn = () => {};

        // setup listeners
        // only need one player to track this
        if (id === "p1")
        {
            listener.on("battleprogress", args => args.events.forEach(event =>
            {
                switch (event.type)
                {
                    case "turn":
                        if (event.num >= maxTurns) done = true;
                        break;
                    case "win":
                        // since the usernames passed into the Network
                        //  constructors are the same was their PlayerID, we can
                        //  safely typecast the username
                        result.winner = event.winner as PlayerID;
                        // fallthrough
                    case "tie":
                        done = true;
                        break;
                }
            }));
        }

        // start parser event loop
        const stream = streams[id];
        promises.push(async function()
        {
            let output: string;
            while (!done && (output = await stream.read()))
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
                perTurn();
            }
            done = true;
            if (file) file.close();
        }());
    }

    await Promise.all(promises);
    return result;
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
        fs.mkdirSync(datasetFolder, {recursive: true});
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
    let bar: ProgressBar;
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

            bar.tick();
            return {done: files.length <= 0, value: [state, target]};
        }};
    }};

    const totalEpochs = 10;
    return model.fitDataset(dataset,
    {
        epochs: totalEpochs,
        callbacks:
        {
            onEpochBegin: async epoch =>
            {
                // epoch is zero-based so increment that so it looks nice
                bar = new ProgressBar(
                    `epoch ${epoch + 1}/${totalEpochs} [:bar] :current/:total`,
                    {total: decisionFiles.length, width: 20});
            }
        }
    });
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
        const {decisions, winner} = await play({p1: newModel, p2: newModel},
            {saveDecisions: true}, `${selfPlayFolder}/game-${i + 1}`);
        decisionFiles.push(...decisions);

        if (winner) bar.interrupt(`game ${i + 1}: ${winner}`);
        else bar.interrupt(`game ${i + 1}: tie`);
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
        const {winner} = await play({p1: newModel, p2: model},
            {saveDecisions: false}, `${evaluateFolder}/game-${i + 1}`);
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

/** Amount of training cycles to do. */
const cycles = 1;

(async function()
{
    let model = await Network.loadModel(modelPath);
    for (let i = 0; i < cycles; ++i)
    {
        logger.log(`TRAINING CYCLE ${i + 1}/${cycles}:`);
        model = await train(model);
    }
    await model.save(`file://${modelPath}`);
})();
