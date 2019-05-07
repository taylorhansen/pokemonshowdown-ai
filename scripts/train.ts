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
import ProgressBar from "progress";
import { Writable } from "stream";
import { URL } from "url";
import { Decision, Network, toColumn } from "../src/ai/Network";
import { Choice } from "../src/battle/agent/Choice";
import { evaluateFolder, modelPath, modelsFolder, selfPlayFolder } from
    "../src/config";
import { Logger } from "../src/Logger";
import { MessageListener } from "../src/psbot/dispatcher/MessageListener";
import { PlayerID } from "../src/psbot/helpers";
import { parsePSMessage } from "../src/psbot/parser/parsePSMessage";
import { PSBattle } from "../src/psbot/PSBattle";
// @ts-ignore
import s = require("./Pokemon-Showdown/.sim-dist/battle-stream");

/** Current progress bar. */
let bar: ProgressBar | undefined;

/** Output stream that doesn't interfere with the progress bar. */
const logStream = new Writable();
type CB = (error: Error | null | undefined) => void;
logStream.write = function(chunk: any, enc?: string | CB, cb?: CB)
{
    if (bar)
    {
        // remove last newline, since ProgressBar#interrupt() adds it
        if (typeof chunk === "string" && chunk.endsWith("\n"))
        {
            chunk = chunk.substr(0, chunk.length - 1);
        }
        bar.interrupt(chunk);
    }
    else process.stderr.write(chunk, enc as any, cb);
    return false;
};

/** Maximum number of turns in a game before it's considered a tie. */
const maxTurns = 100;

/** Models to represent p1 and p2. */
type Models = {[P in PlayerID]: tf.LayersModel};

/** Options for starting a new game. */
interface GameOptions extends Models
{
    /**
     * Whether to save Decision objects to disk, which will be used for learning
     * later.
     */
    saveDecisions?: boolean;
    /** Path to the file in which to store debug info. */
    logPath?: string;
    /** Logger object. */
    logger?: Logger;
}

/** Result object returned from `play()`. */
interface GameResult
{
    /**
     * URLs to saved Decision objects. Empty if `GameOptions#saveDecisions` was
     * false.
     */
    decisions: URL[];
    /** The winner of the game. Null if tied. */
    winner: PlayerID | null;
}

/** Pits two models against each other. */
async function play(options: GameOptions): Promise<GameResult>
{
    const logger = options.logger || Logger.null;

    const streams = s.getPlayerStreams(new s.BattleStream());
    streams.omniscient.write(`>start {"formatid":"gen4randombattle"}`);

    let winner: PlayerID | null = null;
    const eventLoops: Promise<void>[] = [];
    const filePromises: Promise<URL>[] = [];

    // setup log file
    let file: fs.WriteStream | null;
    if (options.logPath)
    {
        const dir = dirname(options.logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});

        file = fs.createWriteStream(options.logPath);
    }
    else file = null;

    let done = false;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        const innerLog = logger.pipeDebug(file).prefix(`Play(${id}): `);

        const agent = new Network(options[id], innerLog.prefix("Network: "));

        // sends player choices to the battle stream
        function sender(choice: Choice): void
        {
            innerLog.debug(`Sending ${choice}`);
            streams[id].write(choice);

            // FIXME: duplicate Decisions can be saved if BattleAgent#decide()
            //  wasn't called between sender calls
            if (options.saveDecisions && agent.decision)
            {
                filePromises.push(saveDecision(agent.decision));
            }
        }

        const battle = new PSBattle(id, agent, sender,
            innerLog.prefix("PSBattle: "));
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        const listener = new MessageListener();

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
                        winner = event.winner as PlayerID;
                        // fallthrough
                    case "tie":
                        done = true;
                        break;
                }
            }));
        }
        // basic functionality
        listener.on("battleinit", msg => battle.init(msg));
        listener.on("battleprogress", msg => battle.progress(msg));
        listener.on("request", msg => battle.request(msg));
        listener.on("error", msg => battle.error(msg));

        // start parser event loop
        const stream = streams[id];
        eventLoops.push(async function()
        {
            let output: string;
            while (!done && (output = await stream.read()))
            {
                innerLog.debug(`received:\n${output}`);
                try
                {
                    await parsePSMessage(output, listener,
                        innerLog.prefix("Parser: "));
                }
                catch (e)
                {
                    innerLog.error(e);
                    console.trace();
                }
            }
            done = true;
            if (file) file.close();
        }());
    }

    await Promise.all(eventLoops);
    return {winner, decisions: await Promise.all(filePromises)};
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
function compile(model: tf.LayersModel): void
{
    model.compile(
        {loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]});
}

/**
 * Trains a model from an array of Decision file URLs.
 * @param decisionFiles Paths to each Decision file.
 */
async function learn(model: tf.LayersModel, decisionFiles: URL[]):
    Promise<tf.History>
{
    const dataset = tf.data.generator(function*()
    {
        const files = [...decisionFiles];
        while (files.length > 0)
        {
            // consume a random Decision file
            const n = Math.floor(Math.random() * files.length);
            const url = files.splice(n, 1)[0];
            const file = fs.readFileSync(url);
            const decision: Decision = JSON.parse(file.toString());

            const state = toColumn(decision.state);
            const target = toColumn(decision.target);

            if (bar) bar.tick();
            yield {xs: state, ys: target};
        }
    });

    return model.fitDataset(dataset, {epochs: 10});
}

/**
 * Trains and evaluates a neural network model.
 * @param model Model to train.
 * @param logger Logger object.
 * @param games Amount of games to play during self-play and evaluation.
 * @returns A new Model if it is proved to be better after self-play, or the
 * same one that's given if the new Model failed.
 */
async function train(model: tf.LayersModel, logger = Logger.null, games = 5):
    Promise<tf.LayersModel>
{
    const newModel = Network.createModel();
    newModel.setWeights(model.getWeights());

    logger.debug("Beginning self-play");
    const decisionFiles: URL[] = [];
    bar = new ProgressBar("Self-play games: [:bar] :current/:total",
        {total: games, clear: true});
    bar.update(0);
    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.prefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        const {decisions, winner} = await play(
        {
            p1: newModel, p2: newModel, saveDecisions: true,
            logPath: `${selfPlayFolder}/game-${i + 1}`, logger: innerLog
        });

        decisionFiles.push(...decisions);

        if (winner) innerLog.debug(`Winner: ${winner}`);
        else innerLog.debug("Tie");
        bar.tick();
    }
    bar = undefined;

    logger.debug("Learning (this may take a while)");
    compile(newModel);
    await learn(newModel, decisionFiles);

    // challenge the old model to see if the newly trained one learned anything
    logger.debug("Evaluating new network (p1=new, p2=old)");
    const wins = {p1: 0, p2: 0};
    bar = new ProgressBar("Evaluation games: [:bar] :current/:total",
        {total: games, clear: true});
    bar.update(0);
    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.prefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        const {winner} = await play(
        {
            p1: newModel, p2: model, logPath: `${evaluateFolder}/game-${i + 1}`,
            logger: innerLog
        });

        if (winner)
        {
            ++wins[winner];
            innerLog.debug(`Winner: ${winner}`);
        }
        else innerLog.debug("Tie");
        bar.tick();
    }
    bar = undefined;

    logger.debug(`Wins: ${JSON.stringify(wins)}`);
    if (wins.p1 > wins.p2)
    {
        logger.debug("New model (p1) wins, replace old model");
        return newModel;
    }
    else if (wins.p1 < wins.p2)
    {
        logger.debug("Old model (p2) wins, not replaced");
    }
    else logger.debug("Tie, old model not replaced");
    return model;
}

/** Amount of training cycles to do. */
const cycles = 1;

(async function()
{
    /** Main top-level logger. */
    const logger = new Logger(logStream, logStream, /*prefix*/"Train: ");

    let model = await Network.loadModel(modelPath, logger.prefix("Network: "));
    for (let i = 0; i < cycles; ++i)
    {
        logger.debug(`Starting training cycle ${i + 1}/${cycles}`);
        model = await train(model,
            logger.prefix(`Cycle(${i + 1}/${cycles}): `));
    }
    logger.debug("Saving model");
    await model.save(`file://${modelPath}`);
})();
