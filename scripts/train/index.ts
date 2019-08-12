/**
 * @file Plays the neural network against itself for several times before
 * training and evaluation.
 *
 * The algorithm is as follows:
 * 1. Construct a neural network.
 * 2. Play the network against itself, storing Experience objects during play to
 *    be used for learning later.
 * 3. After a number of games, train a copy of the neural network using all of
 *    the stored Experiences.
 * 4. Evaluate the newly trained network against the old one to see if the old
 *    one should be replaced on the next training cycle. This is done by playing
 *    some number of games and seeing if the new network beats the old one.
 * 5. Repeat steps 2-4 as desired.
 */
import { datasetFromIteratorFn } from "@tensorflow/tfjs-data/dist/dataset";
import { iteratorFromFunction } from
    "@tensorflow/tfjs-data/dist/iterators/lazy_iterator";
import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import { dirname, join } from "path";
import ProgressBar from "progress";
import { Writable } from "stream";
// @ts-ignore
import s = require("../../Pokemon-Showdown/.sim-dist/battle-stream");
import { sizeBattleState } from "../../src/ai/encodeBattleState";
import { Network, toColumn } from "../../src/ai/Network";
import { intToChoice } from "../../src/battle/agent/Choice";
import { evaluateFolder, latestModelFolder, selfPlayFolder } from
    "../../src/config";
import { Logger } from "../../src/Logger";
import { MessageListener } from "../../src/psbot/dispatcher/MessageListener";
import { PlayerID } from "../../src/psbot/helpers";
import { parsePSMessage } from "../../src/psbot/parser/parsePSMessage";
import { Experience } from "./Experience";
import { TrainBattle } from "./TrainBattle";
import { TrainNetwork } from "./TrainNetwork";

/** Checks if given path is an existing directory. */
async function isDir(url: string): Promise<boolean>
{
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(url); }
    catch (e) { return false; }
    return stat.isDirectory();
}

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

/** Models to represent p1 and p2. */
type Models = {readonly [P in PlayerID]: tf.LayersModel};

interface GameOptions extends Models
{
    /** Maximum amount of turns before the game is considered a tie. */
    readonly maxTurns: number;
    /**
     * Whether to emit Experience objects, which will be used for learning
     * later.
     */
    readonly emitExperiences?: boolean;
    /** Path to the file in which to store debug info. */
    readonly logPath?: string;
    /** Logger object. */
    readonly logger?: Logger;
}

/** Result object returned from `play()`. */
interface GameResult
{
    /**
     * Paths to emitted Experience objects. Empty if
     * `GameOptions#emitExperiences` was false.
     */
    experiences: Experience[];
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
    const experiences: Experience[] = [];

    // setup log file
    let file: fs.WriteStream | null;
    if (options.logPath)
    {
        const dir = dirname(options.logPath);

        if (!await isDir(dir)) await fs.promises.mkdir(dir);

        file = fs.createWriteStream(options.logPath);
    }
    else file = null;

    let done = false;

    for (const id of ["p1", "p2"] as PlayerID[])
    {
        const innerLog = logger.pipeDebug(file).prefix(`Play(${id}): `);

        const agent = new TrainNetwork(options[id],
            innerLog.prefix("Network: "));

        // sends player choices to the battle stream
        function sender(...args: string[]): void
        {
            for (const arg of args)
            {
                // extract choice from args
                // format: |/choose <choice>
                if (arg.startsWith("|/choose "))
                {
                    const choice = arg.substr("|/choose ".length);
                    innerLog.debug(`Sending choice '${choice}'`);
                    streams[id].write(choice);
                }
            }
        }

        const battle = new TrainBattle(id, agent, sender,
            innerLog.prefix("PSBattle: "));
        streams.omniscient.write(`>player ${id} {"name":"${id}"}`);

        // setup listeners
        const listener = new MessageListener();
        if (id === "p1")
        {
            // only need one player to track these
            listener.on("battleprogress", msg => msg.events.forEach(event =>
            {
                switch (event.type)
                {
                    case "turn":
                        if (event.num >= options.maxTurns) done = true;
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
        const parserLog = innerLog.prefix("Parser: ");
        eventLoops.push(async function()
        {
            let output: string;
            while (!done && (output = await stream.read()))
            {
                innerLog.debug(`received:\n${output}`);
                try { await parsePSMessage(output, listener, parserLog); }
                catch (e) { innerLog.error(`${e}\n${(e as Error).stack}`); }
            }

            done = true;
            if (options.emitExperiences)
            {
                experiences.push(...battle.experiences);
            }
        }());
    }

    await Promise.all(eventLoops);

    if (file) file.close();

    return {winner, experiences};
}

/**
 * Trains a model from an array of Experience objects.
 * @param model Model to train.
 * @param experiences Experience objects that will be used for each epoch of
 * training.
 * @param gamma Discount factor for calculating Q-values. This is used to scale
 * down future expected rewards so they don't outweigh the immediate gain by
 * too much.
 * @param epochs Number of epochs to run.
 */
async function learn(model: tf.LayersModel, experiences: readonly Experience[],
    gamma: number, epochs: number): Promise<tf.History>
{
    const dataset = datasetFromIteratorFn<tf.TensorContainerObject>(
    async function()
    {
        // create new experience buffer to sample from
        const exp = [...experiences];
        return iteratorFromFunction<tf.TensorContainerObject>(async function()
        {
            // done if no more files
            // iterator requires value=null if done, but the tensorflow source
            //  allows implicit null and our tsconfig doesn't, so get around
            //  that by using an any-cast
            if (exp.length <= 0) return {value: null as any, done: true};

            // sample a random Experience object
            // this helps break the correlation between consecutive samples for
            //  better generalization
            const n = Math.floor(Math.random() * exp.length);
            const experience = exp.splice(n, 1)[0];

            const xs = toColumn(experience.state);

            // calculate target Q-value
            // a Q network learns the immediate reward plus a scaled-down total
            //  future reward
            // total future reward is calculated using a recent prediction
            const targetData = await (model.predict(xs) as tf.Tensor2D)
                    .data<"float32">();
            const futureReward = await (model.predict(
                    toColumn(experience.nextState)) as tf.Tensor2D).data();
            targetData[experience.action] = experience.reward +
                // choose future reward given the best action (i.e. max reward)
                gamma * futureReward[experience.nextAction];
            const ys = toColumn(targetData);

            return {value: {xs, ys}, done: false};
        });
    })
    .repeat(epochs);

    return model.fitDataset(dataset,
        // technically datasets have an unspecified length, but since we know
        //  when it will terminate (end of experience array), we can provide
        //  this info so we get a nice animating progress bar
        {epochs, batchesPerEpoch: experiences.length});
}

/**
 * Does a training cycle, where a model is trained through self-play then
 * evaluated by playing against a different model.
 * @param toTrain Model to train through self-play.
 * @param model Model to compare against.
 * @param games Amount of games to play during self-play and evaluation.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 * @param logger Logger object.
 * @returns `toTrain` if it is proved to be better after self-play, or `model`
 * if the newly trained `toTrain` model failed.
 */
async function cycle(toTrain: tf.LayersModel, model: tf.LayersModel,
    games: number, maxTurns: number, logger = Logger.null):
    Promise<tf.LayersModel>
{
    logger.debug("Beginning self-play");
    const experiences: Experience[] = [];
    bar = new ProgressBar("Self-play games: [:bar] :current/:total",
        {total: games, clear: true});
    bar.update(0);
    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.prefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        const {experiences: exp, winner} = await play(
        {
            p1: toTrain, p2: toTrain, maxTurns, emitExperiences: true,
            logPath: `${selfPlayFolder}/game-${i + 1}`, logger: innerLog
        });

        experiences.push(...exp);

        if (winner) innerLog.debug(`Winner: ${winner}`);
        else innerLog.debug("Tie");
        bar.tick();
    }
    // clear bar so the main logger doesn't try to print above it anymore
    bar.terminate();
    bar = undefined;

    logger.debug("Learning (this may take a while)");
    await learn(toTrain, experiences, /*gamma*/0.8, /*epochs*/10);

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
            p1: toTrain, p2: model, maxTurns,
            logPath: `${evaluateFolder}/game-${i + 1}`, logger: innerLog
        });

        if (winner)
        {
            ++wins[winner];
            innerLog.debug(`Winner: ${winner}`);
        }
        else innerLog.debug("Tie");
        bar.tick();
    }
    bar.terminate();
    bar = undefined;

    logger.debug(`Wins: ${JSON.stringify(wins)}`);
    if (wins.p1 > wins.p2)
    {
        logger.debug("New model (p1) wins, replace old model");
        return toTrain;
    }
    else if (wins.p1 < wins.p2)
    {
        logger.debug("Old model (p2) wins, not replaced");
    }
    else logger.debug("Tie, old model not replaced");
    return model;
}

/** Creates a model for training. */
function createModel(): tf.LayersModel
{
    // setup all the layers
    const outNeurons = intToChoice.length;

    const model = tf.sequential();

    model.add(tf.layers.dense(
    {
        inputShape: [sizeBattleState], units: 10, activation: "tanh"
    }));
    model.add(tf.layers.dense({units: outNeurons, activation: "linear"}));

    return model;
}

/** Compiles a model so it can be trained. */
function compileModel(model: tf.LayersModel): void
{
    model.compile(
        {loss: "meanSquaredError", optimizer: "adam", metrics: ["mae"]});
}

/**
 * Trains the latest network for a given number of cycles.
 * @param cycles Amount of cycles to train for.
 * @param games Amount of games per cycle for training and evaluation.
 * @param maxTurns Max amount of turns before a game is considered a tie.
 */
async function train(cycles: number, games: number, maxTurns: number)
{
    const logger = new Logger(logStream, logStream, /*prefix*/"Train: ");

    const modelUrl = `file://${latestModelFolder}/`;
    const modelJsonUrl = `file://${join(latestModelFolder, "model.json")}`;

    let toTrain: tf.LayersModel;
    try { toTrain = await Network.loadModel(modelJsonUrl); }
    catch (e)
    {
        logger.error(`Error opening model: ${e}`);
        logger.debug("Creating default model");

        toTrain = createModel();
        await toTrain.save(`file://${latestModelFolder}`);
    }
    compileModel(toTrain);

    // this seems to be the only way to easily clone a tf.LayersModel
    let model = await Network.loadModel(modelJsonUrl);

    for (let i = 0; i < cycles; ++i)
    {
        logger.debug(`Starting training cycle ${i + 1}/${cycles}`);

        const bestModel = await cycle(toTrain, model, games, maxTurns,
            logger.prefix(`Cycle(${i + 1}/${cycles}): `));

        // the model that's better will be used to complete the next cycle
        if (bestModel === toTrain)
        {
            logger.debug("Saving model");
            await bestModel.save(modelUrl);
            // update adversary model
            // in the last cycle we don't need to do this though
            if (i + 1 < cycles)
            {
                model.dispose();
                model = await Network.loadModel(modelJsonUrl);
            }
            logger.debug("Done");
        }
        else
        {
            // failed to learn, rollback to previous version
            toTrain.dispose();
            toTrain = await Network.loadModel(modelJsonUrl);
            compileModel(toTrain);
        }
    }
}

train(1, 5, 100);
