/** @file Defines the model and a few utilities for interacting with it. */
import * as tf from "@tensorflow/tfjs";
import {Rng, rng} from "../util/random";
import * as customLayers from "./custom_layers";
import {
    modelInputNames,
    modelInputShapes,
    modelInputShapesMap,
    modelOutputName,
    modelOutputShape,
    numActive,
    numMoves,
    numTeams,
    teamSize,
} from "./shapes";

/**
 * Creates a default model for training.
 *
 * @param name Name of the model.
 * @param config Additional config options.
 * @param seed Seed for the random number generater to use for kernel
 * initializers.
 */
export function createModel(name: string, seed?: string): tf.LayersModel {
    const random = seed ? rng(seed) : undefined;

    // Note: Must be in order of modelInputShapes.
    const inputs: tf.SymbolicTensor[] = [];

    //#region Inputs and local feature connections.

    const globalFeatures: tf.SymbolicTensor[] = [];

    const roomStatus = inputFeatures(name, "room/status", 8, random);
    inputs.push(roomStatus.input);
    globalFeatures.push(roomStatus.features);

    const teamStatus = inputFeatures(name, "team/status", 16, random);
    inputs.push(teamStatus.input);
    globalFeatures.push(teamStatus.features);

    //#region Team pokemon.

    //#region Individual pokemon features.

    const activeFeatures: tf.SymbolicTensor[] = [];
    const benchFeatures: tf.SymbolicTensor[] = [];

    const activeVolatile = inputFeatures(name, "active/volatile", 32, random);
    inputs.push(activeVolatile.input);
    activeFeatures.push(activeVolatile.features);

    const aliveInput = inputLayer(name, "pokemon/alive");
    inputs.push(aliveInput);
    const {active: activeAlive, bench: benchAlive} = splitBench(
        name,
        "pokemon/alive",
    )(aliveInput);

    const basic = inputFeatures(name, "pokemon/basic", 16, random);
    inputs.push(basic.input);
    const basicSplit = splitBench(name, "pokemon/basic")(basic.features);
    activeFeatures.push(basicSplit.active);
    benchFeatures.push(basicSplit.bench);

    const speciesUnits = 32;
    const species = inputFeatures(
        name,
        "pokemon/species",
        speciesUnits,
        random,
    );
    inputs.push(species.input);
    const speciesSplit = splitPokemon(
        name,
        "pokemon/species",
        speciesUnits,
    )(species.features);
    activeFeatures.push(speciesSplit.active);
    benchFeatures.push(speciesSplit.bench);

    const typesUnits = 32;
    const types = inputFeatures(name, "pokemon/types", typesUnits, random);
    inputs.push(types.input);
    const typesSplit = splitPokemon(
        name,
        "pokemon/types",
        typesUnits,
    )(types.features);
    activeFeatures.push(typesSplit.active);
    benchFeatures.push(typesSplit.bench);

    const statsUnits = 32;
    const stats = inputFeatures(name, "pokemon/stats", statsUnits, random);
    inputs.push(stats.input);
    const statsSplit = splitPokemon(
        name,
        "pokemon/stats",
        statsUnits,
    )(stats.features);
    activeFeatures.push(statsSplit.active);
    benchFeatures.push(statsSplit.bench);

    const abilityUnits = 32;
    const ability = inputFeatures(
        name,
        "pokemon/ability",
        abilityUnits,
        random,
    );
    inputs.push(ability.input);
    const abilitySplit = splitPokemon(
        name,
        "pokemon/ability",
        abilityUnits,
    )(ability.features);
    activeFeatures.push(abilitySplit.active);
    benchFeatures.push(abilitySplit.bench);

    const itemLabels = ["pokemon/item", "pokemon/last_item"];
    const item = inputFeaturesList(name, itemLabels, 64, random);
    inputs.push(...item.inputs);
    const itemSplit = itemLabels.map((label, i) =>
        splitBench(name, label)(item.features[i]),
    );
    activeFeatures.push(...itemSplit.map(split => split.active));
    benchFeatures.push(...itemSplit.map(split => split.bench));

    const moveUnits = 32;
    const moves = inputFeatures(name, "pokemon/moves", moveUnits, random);
    const moveAttention = selfAttentionBlock(
        name,
        "pokemon/moves",
        4 /*heads*/,
        8 /*headUnits*/,
        moveUnits /*units*/,
        random,
    )(moves.features);
    const moveset = poolingAttentionBlock(
        name,
        "pokemon/moves",
        4 /*heads*/,
        8 /*headUnits*/,
        moveUnits /*units*/,
        random,
    )(moveAttention);
    const movesetSplit = splitPokemon(
        name,
        "pokemon/moves",
        moveUnits,
    )(moveset);
    inputs.push(moves.input);
    activeFeatures.push(movesetSplit.active);
    benchFeatures.push(movesetSplit.bench);

    //#endregion

    //#region Aggregate pokemon features.

    const activeUnits = 64;
    const active = combinePokemon(
        name,
        "active",
        activeUnits,
        random,
    )(activeFeatures, activeAlive);
    globalFeatures.push(active);

    const benchUnits = 64;
    const bench = combinePokemon(
        name,
        "bench",
        benchUnits,
        random,
    )(benchFeatures, benchAlive);
    const benchAttention = selfAttentionBlock(
        name,
        "bench",
        4 /*heads*/,
        16 /*headUnits*/,
        benchUnits /*units*/,
        random,
    )(bench, benchAlive);

    const benchAggregate = poolingAttentionBlock(
        name,
        "bench",
        4 /*heads*/,
        8 /*headUnits*/,
        benchUnits /*units*/,
        random,
    )(benchAttention);
    globalFeatures.push(benchAggregate);

    //#endregion

    //#endregion

    //#endregion

    //#region Global feature connections.

    const global = aggregateGlobal(name, "global", 128, random)(globalFeatures);

    //#endregion

    //#region Output.

    const actionMove = actionValues(
        name,
        "action/move",
        numMoves,
        moveUnits,
        // Note: Slicing through both teams and pokemon list to get first active
        // override traits, i.e. direct move features.
        {begin: [0, 0], size: [1, 1]},
        random,
    )(moveAttention, global);

    const actionSwitch = actionValues(
        name,
        "action/switch",
        teamSize - numActive,
        benchUnits,
        {begin: 0, size: 1},
        random,
    )(benchAttention, global);

    const advantage = combineAction(name, "action")([actionMove, actionSwitch]);

    const value = stateValue(name, "state")(global);

    const q = dueling(name, "action")(advantage, value);

    //#endregion

    const model = tf.model({name, inputs, outputs: [q]});
    verifyModel(model);
    return model;
}

/**
 * Creates an input layer.
 *
 * @param name Name of model.
 * @param label Name of input for shape lookup.
 */
function inputLayer(name: string, label: string): tf.SymbolicTensor {
    return tf.layers.input({
        name: `${name}/${label}/input`,
        shape: [...modelInputShapesMap[label]],
    });
}

/**
 * Intermediate data structure representing the inputs and outputs of a
 * subsection of the first layer of processing in the main model.
 */
interface InputFeatures {
    input: tf.SymbolicTensor;
    features: tf.SymbolicTensor;
}

/**
 * Creates basic input features with a dense layer.
 *
 * @param name Name of model.
 * @param label Name of input for shape lookup.
 * @param units Hidden layer size.
 * @param random Optional seeder for weight init.
 * @returns Both the input and output features.
 */
function inputFeatures(
    name: string,
    label: string,
    units: number,
    random?: Rng,
): InputFeatures {
    const input = inputLayer(name, label);
    let features = tf.layers
        .dense({
            name: `${name}/${label}/dense`,
            units,
            kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
            biasInitializer: "zeros",
        })
        .apply(input) as tf.SymbolicTensor;
    features = tf.layers
        .leakyReLU({name: `${name}/${label}/leaky_relu`})
        .apply(features) as tf.SymbolicTensor;
    return {input, features};
}

/** Input features with multiple inputs/outputs. */
interface InputFeaturesList {
    inputs: tf.SymbolicTensor[];
    features: tf.SymbolicTensor[];
}

/**
 * Creates basic input features with a shared dense layer for each input.
 *
 * @param name Name of model.
 * @param labels Names of inputs for shape lookup.
 * @param units Hidden layer size.
 * @param random Optional seeder for weight init.
 * @returns Both the input and output features.
 */
function inputFeaturesList(
    name: string,
    labels: string[],
    units: number,
    random?: Rng,
): InputFeaturesList {
    const inputs = labels.map(label => inputLayer(name, label));
    const denseLayer = tf.layers.dense({
        name: `${name}/${labels[0]}/dense`,
        units,
        kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${labels[0]}/leaky_relu`,
    });
    const features = inputs.map(
        input =>
            activationLayer.apply(denseLayer.apply(input)) as tf.SymbolicTensor,
    );
    return {inputs, features};
}

/**
 * Creates a group of layers for splitting pokemon features into active and
 * bench.
 *
 * Active features are stored at the beginning of the array of general pokemon
 * features, alternating between override and base trait representations for
 * each element.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param units Size of input features.
 * @returns A function to apply the split layers.
 */
function splitPokemon(
    name: string,
    label: string,
    units: number,
): (
    features: tf.SymbolicTensor,
) => Record<"active" | "bench", tf.SymbolicTensor> {
    const activeSplitLayer = customLayers.slice({
        name: `${name}/${label}/split/active`,
        begin: [0, 0],
        // Note: Have to account for both override and base trait vectors for
        // each active pokemon.
        size: [numTeams, numActive * 2],
    });
    const activeReshapeLayer = tf.layers.reshape({
        name: `${name}/${label}/split/active/reshape`,
        targetShape: [numTeams, numActive, units * 2],
    });
    const benchSplitLayer = customLayers.slice({
        name: `${name}/${label}/split/bench`,
        begin: [0, numActive * 2],
        size: [numTeams, teamSize - numActive],
    });
    return features => ({
        active: activeReshapeLayer.apply(
            activeSplitLayer.apply(features),
        ) as tf.SymbolicTensor,
        bench: benchSplitLayer.apply(features) as tf.SymbolicTensor,
    });
}

/**
 * Creates a group of layers splitting pokemon features into active and bench,
 * assuming there are no extra override traits included in the input.
 *
 * Features of active pokemon are stored at the beginning of the array of
 * general pokemon features, with the bench filling out the rest.
 *
 * @param name of model.
 * @param label Name of module.
 * @returns A function to apply the split layers.
 */
function splitBench(
    name: string,
    label: string,
): (
    features: tf.SymbolicTensor,
) => Record<"active" | "bench", tf.SymbolicTensor> {
    const activeSplit = customLayers.slice({
        name: `${name}/${label}/split/active`,
        begin: [0, 0],
        size: [numTeams, numActive],
    });
    const benchSplit = customLayers.slice({
        name: `${name}/${label}/split/bench`,
        begin: [0, numActive],
        size: [numTeams, teamSize - numActive],
    });
    return features => ({
        active: activeSplit.apply(features) as tf.SymbolicTensor,
        bench: benchSplit.apply(features) as tf.SymbolicTensor,
    });
}

/**
 * Creates a self-attention block with residual connection for unordered input.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param heads Number of attention heads.
 * @param headUnits Size of each head.
 * @param units Size of input.
 * @param random Optional seeder for weight init.
 * @returns A function to apply the attention block and output the same shape as
 * input but with the feature dimension replaced with `units`.
 */
function selfAttentionBlock(
    name: string,
    label: string,
    heads: number,
    headUnits: number,
    units: number,
    random?: Rng,
): (
    features: tf.SymbolicTensor,
    mask?: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    const attentionLayer = customLayers.setAttention({
        name: `${name}/${label}/attention`,
        heads,
        headUnits,
        units,
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
    });
    const attentionActivationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/attention/leaky_relu`,
    });
    const attentionResidualLayer1 = tf.layers.add({
        name: `${name}/${label}/attention/residual`,
    });
    const attentionDenseLayer = tf.layers.dense({
        name: `${name}/${label}/attention/dense`,
        units,
    });
    const attentionDenseActivationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/attention/dense/leaky_relu`,
    });
    const attentionResidualLayer2 = tf.layers.add({
        name: `${name}/${label}/attention/dense/residual`,
    });
    const maskLayer = customLayers.mask({
        name: `${name}/${label}/attention/dense/mask`,
    });
    return function selfAttentionBlockImpl(features, mask) {
        let attention = attentionLayer.apply(
            mask ? [features, mask] : features,
        ) as tf.SymbolicTensor;
        attention = attentionActivationLayer.apply(
            attention,
        ) as tf.SymbolicTensor;
        // Add skip connection.
        features = attentionResidualLayer1.apply([
            features,
            attention,
        ]) as tf.SymbolicTensor;
        // Final encoder.
        let dense = attentionDenseLayer.apply(features) as tf.SymbolicTensor;
        dense = attentionDenseActivationLayer.apply(dense) as tf.SymbolicTensor;
        // Final skip connection.
        features = attentionResidualLayer2.apply([
            features,
            dense,
        ]) as tf.SymbolicTensor;
        // One more mask since dense layer could've caused zeros to diverge.
        if (mask) {
            features = maskLayer.apply([features, mask]) as tf.SymbolicTensor;
        }
        return features;
    };
}

/**
 * Creates a layer that concatenates pokemon features and applies a dense layer.
 * Each input must share the same beginning shape `[batch..., N, P]` where `N`
 * is the number of teams and `P` is the number of active pokemon.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param units Hidden layer size.
 * @param random Optional seeder for weight init.
 * @returns A function to apply the concat and dense layer as well as mask out
 * fainted pokemon. Replaces last dimension with `units`.
 */
function combinePokemon(
    name: string,
    label: string,
    units: number,
    random?: Rng,
): (
    features: tf.SymbolicTensor[],
    mask: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    const concatLayer = tf.layers.concatenate({
        name: `${name}/${label}/concat`,
        axis: -1,
    });
    const denseLayer = tf.layers.dense({
        name: `${name}/${label}/dense`,
        units,
        kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/leaky_relu`,
    });
    const maskLayer = customLayers.mask({name: `${name}/${label}/mask`});
    return function combineActiveImpl(features, mask) {
        let combined = concatLayer.apply(features) as tf.SymbolicTensor;
        combined = denseLayer.apply(combined) as tf.SymbolicTensor;
        combined = activationLayer.apply(combined) as tf.SymbolicTensor;
        combined = maskLayer.apply([combined, mask]) as tf.SymbolicTensor;
        return combined;
    };
}

/**
 * Creates a pooling multi-head attention block for unordered input.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param heads Number of attention heads.
 * @param headUnits Size of each head.
 * @param units Size of input.
 * @param random Optional seeder for weight init.
 * @returns A function to apply the pooling attention block. Collapses element
 * dimension and replaces feature dimension with `units`.
 */
function poolingAttentionBlock(
    name: string,
    label: string,
    heads: number,
    headUnits: number,
    units: number,
    random?: Rng,
): (
    features: tf.SymbolicTensor,
    mask?: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    const attentionLayer = customLayers.poolingAttention({
        name: `${name}/${label}/pooling_attention`,
        seeds: 1,
        heads,
        headUnits,
        units,
        collapseSeedDim: true,
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/pooling_attention/leaky_relu`,
    });
    return function selfAttentionBlockImpl(features, mask) {
        features = attentionLayer.apply(
            mask ? [features, mask] : features,
        ) as tf.SymbolicTensor;
        features = activationLayer.apply(features) as tf.SymbolicTensor;
        return features;
    };
}

/**
 * Creates a layer that flattens and concatenates all of its inputs then applies
 * a dense layer.
 *
 * @param name Name of model.
 * @param units Name of module.
 * @param units Hidden layer size.
 * @param random Optional seeder for weight init.
 * @returns A function to apply the flatten, concat, and dense layers. Replaces
 * feature dimension with `units`.
 */
function aggregateGlobal(
    name: string,
    label: string,
    units: number,
    random?: Rng,
): (features: tf.SymbolicTensor[]) => tf.SymbolicTensor {
    const flattenLayer = tf.layers.flatten({
        name: `${name}/${label}/flatten`,
    });
    const concatLayer = tf.layers.concatenate({
        name: `${name}/${label}/concat`,
        axis: -1,
    });
    const denseLayer = tf.layers.dense({
        name: `${name}/${label}/dense`,
        units,
        kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/leaky_relu`,
    });
    return function aggregateGlobalImpl(features) {
        const flattened = features.map(t =>
            t.rank === 2 ? t : (flattenLayer.apply(t) as tf.SymbolicTensor),
        );
        let combined = concatLayer.apply(flattened) as tf.SymbolicTensor;
        combined = denseLayer.apply(combined) as tf.SymbolicTensor;
        combined = activationLayer.apply(combined) as tf.SymbolicTensor;
        return combined;
    };
}

/**
 * Creates a layer that computes the value of each action.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param numActions Number of possible actions.
 * @param units Size of input features for each action.
 * @param sliceArgs Args for slicing the local feature tensor.
 * @param random Optional seeder for weight init.
 * @returns A function to compute action values using the local input vector
 * (shape `[batch, N, U]`) as well as the aggregate global feature vector (shape
 * `[batch, G]`).
 */
function actionValues(
    name: string,
    label: string,
    numActions: number,
    units: number,
    sliceArgs: customLayers.SliceArgs,
    random?: Rng,
): (local: tf.SymbolicTensor, global: tf.SymbolicTensor) => tf.SymbolicTensor {
    // Note: Should only consider actions for client's side (index 0).
    const localSliceLayer = customLayers.slice({
        name: `${name}/${label}/local/slice`,
        ...sliceArgs,
    });
    const localReshapeLayer = tf.layers.reshape({
        name: `${name}/${label}/local/reshape`,
        targetShape: [numActions, units],
    });
    const globalRepeatLayer = tf.layers.repeatVector({
        name: `${name}/${label}/global/repeat`,
        n: numActions,
    });
    const concatLayer = tf.layers.concatenate({
        name: `${name}/${label}/concat`,
        axis: -1,
    });
    const denseLayer = tf.layers.dense({
        name: `${name}/${label}/dense`,
        units: 1,
        activation: "linear",
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const reshapeLayer = tf.layers.reshape({
        name: `${name}/${label}/reshape`,
        targetShape: [numActions],
    });
    return function actionValuesImpl(local, global) {
        local = localSliceLayer.apply(local) as tf.SymbolicTensor;
        local = localReshapeLayer.apply(local) as tf.SymbolicTensor;
        global = globalRepeatLayer.apply(global) as tf.SymbolicTensor;
        let values = concatLayer.apply([local, global]) as tf.SymbolicTensor;
        values = denseLayer.apply(values) as tf.SymbolicTensor;
        values = reshapeLayer.apply(values) as tf.SymbolicTensor;
        return values;
    };
}

/**
 * Creates a layer that concatenates multiple action outputs.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @returns A function that applies the concat layer. Combines last dimension.
 */
function combineAction(
    name: string,
    label: string,
): (actions: tf.SymbolicTensor[]) => tf.SymbolicTensor {
    const concatLayer = tf.layers.concatenate({
        name: `${name}/${label}/concat`,
        axis: -1,
    });
    return actions => concatLayer.apply(actions) as tf.SymbolicTensor;
}

/**
 * Creates a layer that computes the value of the state.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param random Optional seeder for weight init.
 * @returns A function to compute the state value using global features.
 */
function stateValue(
    name: string,
    label: string,
    random?: Rng,
): (global: tf.SymbolicTensor) => tf.SymbolicTensor {
    const denseLayer = tf.layers.dense({
        name: `${name}/${label}/value`,
        units: 1,
        // Note: Reward in range [-1, 1].
        activation: "tanh",
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    return global => denseLayer.apply(global) as tf.SymbolicTensor;
}

/**
 * Creates a layer that computes Q-values from action advantages and state
 * value.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @returns A function to compute the Q-values.
 */
function dueling(
    name: string,
    label: string,
): (
    advantage: tf.SymbolicTensor,
    value: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    const meanAdvLayer = customLayers.mean({
        name: `${name}/${label}/mean`,
        axis: -1,
        keepDims: true,
    });
    const advSubLayer = customLayers.sub({name: `${name}/${label}/sub`});
    const qAddLayer = tf.layers.add({name: `${name}/${label}/add`});
    return function duelingImpl(advantage, value) {
        const meanAdv = meanAdvLayer.apply(advantage) as tf.SymbolicTensor;
        const centeredAdv = advSubLayer.apply([
            advantage,
            meanAdv,
        ]) as tf.SymbolicTensor;
        const q = qAddLayer.apply([centeredAdv, value]) as tf.SymbolicTensor;
        return q;
    };
}

/**
 * Verifies that the model is compatible with the input/output shapes as
 * specified by {@link modelInputShapes} and {@link modelOutputShape}.
 *
 * @throws Error if invalid input/output shapes.
 */
export function verifyModel(model: tf.LayersModel): void {
    validateInput(model.input);
    validateOutput(model.output);
}

/** Ensures that the model input shape is valid. */
function validateInput(input: tf.SymbolicTensor | tf.SymbolicTensor[]): void {
    if (!Array.isArray(input)) {
        throw new Error("Model input is not an array");
    }
    if (input.length !== modelInputShapes.length) {
        throw new Error(
            `Expected ${modelInputShapes.length} inputs but found ` +
                `${input.length}`,
        );
    }
    for (let i = 0; i < modelInputShapes.length; ++i) {
        const {shape} = input[i];
        const expectedShape = [null, ...modelInputShapes[i]];
        let invalid: boolean | undefined;
        if (shape.length !== expectedShape.length) {
            invalid = true;
        } else {
            for (let j = 0; j < expectedShape.length; ++j) {
                if (shape[j] !== expectedShape[j]) {
                    invalid = true;
                    break;
                }
            }
        }
        if (invalid) {
            throw new Error(
                `Expected input ${i} (${modelInputNames[i]}) to have shape ` +
                    `${JSON.stringify(expectedShape)} but found ` +
                    `${JSON.stringify(shape)}`,
            );
        }
    }
}

/** Ensures that the model output shape is valid. */
function validateOutput(output: tf.SymbolicTensor | tf.SymbolicTensor[]): void {
    if (Array.isArray(output)) {
        throw new Error("Model output must not be an array");
    }
    const expectedShape = [null, ...modelOutputShape];
    for (let i = 0; i < expectedShape.length; ++i) {
        if (output.shape[i] !== expectedShape[i]) {
            throw new Error(
                `Expected output (${modelOutputName}) to have shape ` +
                    `${JSON.stringify(expectedShape)} but found ` +
                    `${JSON.stringify(output.shape)}`,
            );
        }
    }
}

/**
 * Converts the data lists into tensors
 *
 * @param includeBatchDim Whether to include an extra 1 dimension in the first
 * axis for the batch. Default false.
 */
export function encodedStateToTensors(
    arr: Float32Array[],
    includeBatchDim?: boolean,
): tf.Tensor[] {
    if (arr.length !== modelInputShapes.length) {
        throw new Error(
            `Expected ${modelInputShapes.length} inputs but found ` +
                `${arr.length}`,
        );
    }
    return modelInputShapes.map((shape, i) =>
        tf.tensor(
            arr[i],
            includeBatchDim ? [1, ...shape] : [...shape],
            "float32",
        ),
    );
}
