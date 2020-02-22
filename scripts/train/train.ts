import * as tf from "@tensorflow/tfjs-node";
import { Choice, intToChoice } from "../../src/battle/agent/Choice";
import { ReadonlyBattleState } from "../../src/battle/state/BattleState";
import { Logger } from "../../src/Logger";
import { startBattle } from "./battle";
import { Experience } from "./Experience";
import { ExperiencePSBattle } from "./ExperiencePSBattle";
import { ExploreNetwork, ExploreOptions } from "./ExploreNetwork";
import { layerMax } from "./layerMax";
import { Memory } from "./Memory";
import { shuffle } from "./shuffle";

/** Options for `playRandomly()` */
interface RandomPlayOptions
{
    /** Memory object to populate. */
    readonly memory: Memory;
    /** Minimum number of Experience objects to generate. */
    readonly minExp: number;
    /** If provided, store debug logs in this folder. */
    readonly logPath?: string;
    /**
     * If provided, use this as a filename prefix. Default `random`. Ignored if
     * `logPath` is not provided.
     */
    readonly logFilePrefix?: string;
}

/**
 * Repeats playing games randomly until the desired number of Experience objects
 * has been reached.
 */
async function playRandomly(
    {memory, minExp, logPath, logFilePrefix}: RandomPlayOptions): Promise<void>
{
    const agent =
    {async decide(state: ReadonlyBattleState, choices: Choice[]): Promise<void>
    {
        shuffle(choices);
    }};

    let done = false;

    // emit experience objs after each accepted response
    const psBattleCtor = class extends ExperiencePSBattle
    {
        /** @override */
        protected async emitExperience(exp: Experience): Promise<void>
        {
            memory.add(exp);
            if (!done && --minExp <= 0) done = true;
        }
    };

    // keep playing games randomly until we have enough experience
    let games = 1;
    while (!done)
    {
        await startBattle(
        {
            p1: {agent, psBattleCtor}, p2: {agent, psBattleCtor},
            // only provide logPath/filename if logPath is also specified
            ...(logPath &&
                {logPath, filename: `${logFilePrefix || "random"}-${games}`}),
            logPrefix: "Pretrain: "
        });
        ++games;
    }
}

/**
 * Prepares the Q network for training by wrapping it in a new network. The new
 * network takes an additional action id parameter (i.e. the id of a desired
 * Choice) and uses it to mask out all Q values except for the one associated
 * with that action. The resulting LayersModel will also be compiled and ready
 * to be trained.
 */
function prepareQNetwork(model: tf.LayersModel): tf.LayersModel
{
    // add an input for the action id
    const actionId = tf.layers.input(
        {name: "train-wrapper/action-id", shape: [1]});

    // convert the action id into a one-hot
    const actionMask =
        tf.layers.embedding(
        {
            name: "train-wrapper/action-mask", trainable: false,
            inputDim: intToChoice.length, outputDim: intToChoice.length,
            embeddingsInitializer: "identity"
        })
        .apply(actionId) as tf.SymbolicTensor;

    // the previous layer has the shape [null, 1, 9]
    // reshape it to be [null, 9] so we can use it as a mask next
    const actionMaskReshaped = tf.layers.reshape(
        {
            name: "train-wrapper/action-mask-reshaped",
            targetShape: [intToChoice.length]
        }).apply(actionMask) as tf.SymbolicTensor;

    // elementwise multiply the mask layer with the model's output
    // thanks to the embed mask, only 1 q value will be contained in this
    //  layer's output, with the rest being zeros
    const maskedQValues = tf.layers.multiply(
            {name: "train-wrapper/masked-q-values"})
        .apply([actionMaskReshaped, model.outputs[0]]) as tf.SymbolicTensor;

    // find the q value that wasn't masked out and return it
    const output = layerMax({name: "train-wrapper/single-q-value"})
        .apply(maskedQValues) as tf.SymbolicTensor;

    const result = tf.model(
    {
        name: "train-wrapper",
        inputs: [model.inputs[0], actionId], outputs: output
    });
    result.compile({loss: "meanSquaredError", optimizer: "adam"});
    return result;
}

/** Options for `learningStep()` */
interface LearnOptions
{
    /** Wrapper model to train. */
    readonly toTrain: tf.LayersModel;
    /** Original model that is contained by `toTrain`. */
    readonly model: tf.LayersModel;
    /** Experience object batch to learn from. */
    readonly expBatch: readonly Experience[];
    /** Discount factor for future reward values. */
    readonly gamma: number;
}

/**
 * Makes a single learning step with the Q network using the provided Experience
 * objects.
 * @returns The training loss from the learning step.
 */
async function learningStep({toTrain, model, expBatch, gamma}: LearnOptions):
    Promise<number>
{
    if (expBatch.length <= 0)
    {
        throw new Error("No Experiences to train with");
    }

    const states: tf.Tensor[] = [];
    const actions: tf.Tensor[] = [];
    const targets: tf.Tensor[] = [];

    for (const exp of expBatch)
    {
        states.push(tf.tensor1d(exp.state));
        actions.push(tf.tensor1d([exp.action]));

        // apply the bellman equation to calculate the target q value for a
        //  given state and action
        // this is equal to the immediate reward plus the max predicted reward
        //  (in the neural network's current opinion) multiplied by the discount
        //  factor
        const maxQ = tf.tidy(() =>
            tf.max(model.predict(tf.tensor([exp.nextState])) as tf.Tensor));
        const maxQData = await maxQ.data();
        maxQ.dispose();
        const target = exp.reward + gamma * maxQData[0];

        targets.push(tf.tensor1d([target]));
    }

    // the model is compiled to only track loss, with no other metrics, so
    //  trainOnBatch() should only return a single number
    const stateBatch = tf.stack(states);
    const actionBatch = tf.stack(actions);
    const targetBatch = tf.stack(targets);
    tf.dispose([...states, ...actions, ...targets]);

    const loss = await toTrain.trainOnBatch([stateBatch, actionBatch],
        targetBatch) as unknown as number;
    tf.dispose([stateBatch, actionBatch, targetBatch]);

    return loss;
}

/** Options for `doTrainingGame()`. */
interface TrainingGameOptions
{
    /** Wrapper model to train. */
    readonly toTrain: tf.LayersModel;
    /** Original model that is contained by `toTrain`. */
    readonly model: tf.LayersModel;
    /** Memory object to populate and sample from. */
    readonly memory: Memory;
    /** Experience batch size during training. */
    readonly batchSize: number;
    /** Discount factor for future reward values. */
    readonly gamma: number;
    /** Settings for epsilon-greedy policy training. */
    readonly explore: ExploreOptions;
    /** Logger object. */
    readonly logger: Logger;
    /** If provided, store debug logs in this folder. */
    readonly logPath?: string;
    /**
     * If provided, use this as a filename prefix. Default `train`. Ignored if
     * `logPath` is not provided.
     */
    readonly filename?: string;
}

/**
 * Completes a single training session by playing the neural network against
 * itself for one game, updating it after every decision.
 */
async function doTrainingGame(
    {
        toTrain, model, memory, batchSize, gamma, explore, logger, logPath,
        filename
    }: TrainingGameOptions): Promise<void>
{
    const agent = new ExploreNetwork(model, "deterministic", explore);

    let batches = 0;

    // emit experience objs after each accepted response
    const psBattleCtor = class extends ExperiencePSBattle
    {
        /** @override */
        protected async emitExperience(exp: Experience): Promise<void>
        {
            memory.add(exp);
            // initiate a learning step with a mini-batch
            const loss = await learningStep(
                {toTrain, model, expBatch: memory.sample(batchSize), gamma});
            logger.debug(`Batch ${++batches} loss: ${loss}`);
        }
    };

    await startBattle(
    {
        p1: {agent, psBattleCtor}, p2: {agent, psBattleCtor},
        ...(logPath && {logPath, filename: filename || "train"}),
        logPrefix: "Train: "
    });
}

/** Options for `train()`. */
export interface TrainOptions
{
    /** Model to train. */
    readonly model: tf.LayersModel;
    /**
     * If provided, save the neural network to this location after each game.
     */
    readonly saveUrl?: string;
    /** Number of training games to play. */
    readonly games: number;
    /** Discount factor for future rewards. */
    readonly gamma: number;
    /** Settings for epsilon-greedy policy training. */
    readonly explore: ExploreOptions;
    /** Experience batch size during training. */
    readonly batchSize: number;
    /**
     * Experience buffer size. Mini batches of size `batchSize` are sampled from
     * here. Must be greater than or equal to `batchSize`.
     */
    readonly memorySize: number;
    /** Path to store game logs. Omit to not store logs. */
    readonly logPath?: string;
}

/** Trains a neural network over a number of self-play games. */
export async function train(
    {model, saveUrl, games, gamma, explore, batchSize, memorySize, logPath}:
        TrainOptions): Promise<void>
{
    const logger = Logger.stderr.addPrefix("Train: ");
    const memory = new Memory(memorySize);

    // pretrain games
    // populate memory buffer with some starting Experience objects by playing
    //  completely randomly
    logger.debug("Populating experience replay buffer");
    await playRandomly(
        {memory, minExp: batchSize, logPath, logFilePrefix: "pretrain"});
    logger.debug(`Added ${memory.size} Experience tuples`);

    // setup network for training
    logger.debug("Preparing neural network for training");
    const trainWrapper = prepareQNetwork(model);

    // actual training games
    logger.debug("Starting training games");
    for (let i = 0; i < games; ++i)
    {
        const innerLog = logger.addPrefix(`Game(${i + 1}/${games}): `);
        innerLog.debug("Start");

        await doTrainingGame(
        {
            toTrain: trainWrapper, model, memory, batchSize, gamma, explore,
            logger: innerLog,
            ...(logPath && {logPath, filename: `train-${i + 1}`})
        });

        innerLog.debug("Done");

        if (saveUrl)
        {
            logger.debug("Saving");
            await model.save(saveUrl);
        }
    }
}
