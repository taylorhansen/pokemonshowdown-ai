/** @file Defines the model and a few utilities for interacting with it. */
import * as tf from "@tensorflow/tfjs";
import {ModelConfig} from "../config/types";
import * as rewards from "../game/rewards";
import {intToChoice} from "../psbot/handlers/battle/agent";
import {Rng, rng} from "../util/random";
import * as customLayers from "./custom_layers";
import {
    modelInputNames,
    modelInputShapes,
    modelInputShapesMap,
    numActive,
    numMoves,
    numTeams,
    teamSize,
} from "./shapes";

/** Metadata added to model upon {@link createModel creation}. */
export interface ModelMetadata {
    /** Config used to create the model. */
    config?: ModelConfig;
    /** Random seed used for weight init. */
    seed?: string;
}

/**
 * Creates a default model for training.
 *
 * @param name Name of the model.
 * @param config Additional config options.
 * @param seed Seed for the random number generater to use for kernel
 * initializers.
 * @see {@link ModelMetadata} for additional info added to the model afterwards.
 */
export function createModel(
    name: string,
    config?: ModelConfig,
    seed?: string,
): tf.LayersModel {
    const random = seed ? rng(seed) : undefined;

    // Note: Must be in order of modelInputShapes.
    const inputs: tf.SymbolicTensor[] = [];

    //#region Inputs and local feature connections.

    const globalFeatures: tf.SymbolicTensor[] = [];

    const roomStatus = inputFeatures(name, "room/status", 64, random);
    inputs.push(roomStatus.input);
    globalFeatures.push(roomStatus.features);

    const teamStatus = inputFeatures(name, "team/status", 64, random);
    inputs.push(teamStatus.input);
    globalFeatures.push(teamStatus.features);

    //#region Team pokemon.

    //#region Individual pokemon features.

    // For [2,7,X] features where active traits also include override info.
    const activeAndPokemonFeatures: tf.SymbolicTensor[] = [];
    // For [2,6,X] features where active traits are not overridden.
    const pokemonFeatures: tf.SymbolicTensor[] = [];

    const activeVolatile = inputFeatures(name, "active/volatile", 128, random);
    inputs.push(activeVolatile.input);

    const aliveInput = inputLayer(name, "pokemon/alive");
    inputs.push(aliveInput);
    const {active: activeAlive, bench: benchAlive} = splitPokemon(
        name,
        "pokemon/alive",
    )(aliveInput);

    const basic = inputFeatures(name, "pokemon/basic", 128, random);
    inputs.push(basic.input);
    pokemonFeatures.push(basic.features);

    const speciesUnits = 128;
    const species = inputFeatures(
        name,
        "pokemon/species",
        speciesUnits,
        random,
    );
    inputs.push(species.input);
    activeAndPokemonFeatures.push(species.features);

    const typesUnits = 128;
    const types = inputFeatures(name, "pokemon/types", typesUnits, random);
    inputs.push(types.input);
    activeAndPokemonFeatures.push(types.features);

    const statsUnits = 128;
    const stats = inputFeatures(name, "pokemon/stats", statsUnits, random);
    inputs.push(stats.input);
    activeAndPokemonFeatures.push(stats.features);

    const abilityUnits = 128;
    const ability = inputFeatures(
        name,
        "pokemon/ability",
        abilityUnits,
        random,
    );
    inputs.push(ability.input);
    activeAndPokemonFeatures.push(ability.features);

    const itemLabels = ["pokemon/item", "pokemon/last_item"];
    const item = inputFeaturesList(name, itemLabels, 128, random);
    inputs.push(...item.inputs);
    pokemonFeatures.push(...item.features);

    const moveUnits = 128;
    const moves = inputFeatures(name, "pokemon/moves", moveUnits, random);
    inputs.push(moves.input);
    const moveset = selfAttentionBlock(
        name,
        "pokemon/moves",
        4 /*heads*/,
        32 /*headUnits*/,
        moveUnits /*units*/,
        random,
    )(moves.features);
    const movesetAggregate = poolingAttentionBlock(
        name,
        "pokemon/moves",
        4 /*heads*/,
        32 /*headUnits*/,
        moveUnits /*units*/,
        random,
    )(moveset);
    activeAndPokemonFeatures.push(movesetAggregate);

    //#endregion

    //#region Aggregate pokemon features.

    const activeAndPokemon = tf.layers
        .concatenate({
            name: `${name}/active_pokemon/concat`,
            axis: -1,
        })
        .apply(activeAndPokemonFeatures) as tf.SymbolicTensor;
    const activeAndPokemonSplit = splitActiveAndPokemon(
        name,
        "active_pokemon",
        activeAndPokemon.shape[activeAndPokemon.shape.length - 1]!,
    )(activeAndPokemon);

    const pokemon = tf.layers
        .concatenate({
            name: `${name}/pokemon/concat`,
            axis: -1,
        })
        .apply(pokemonFeatures) as tf.SymbolicTensor;
    const pokemonSplit = splitPokemon(name, "pokemon")(pokemon);

    const activeFeatures = [
        activeVolatile.features,
        activeAndPokemonSplit.active,
        pokemonSplit.active,
    ];
    const activeUnits = 256;
    let active = combinePokemon(
        name,
        "active",
        activeUnits,
        random,
    )(activeFeatures, activeAlive);
    // Pre-flatten for later skip connections.
    active = tf.layers
        .flatten({name: `${name}/active/flatten`})
        .apply(active) as tf.SymbolicTensor;
    globalFeatures.push(active);

    const benchFeatures = [activeAndPokemonSplit.bench, pokemonSplit.bench];
    const benchUnits = 256;
    let bench = combinePokemon(
        name,
        "bench",
        benchUnits,
        random,
    )(benchFeatures, benchAlive);
    bench = selfAttentionBlock(
        name,
        "bench",
        8 /*heads*/,
        32 /*headUnits*/,
        benchUnits /*units*/,
        random,
    )(bench, benchAlive);

    const benchAggregate = poolingAttentionBlock(
        name,
        "bench",
        8 /*heads*/,
        32 /*headUnits*/,
        benchUnits /*units*/,
        random,
    )(bench);
    globalFeatures.push(benchAggregate);

    //#endregion

    //#endregion

    //#endregion

    //#region Global feature connections.

    let global = aggregateGlobal(name, "global", 256, random)(globalFeatures);
    // Emphasize active pokemon when choosing action values via skip connection.
    global = tf.layers
        .concatenate({name: `${name}/active_global/concat`})
        .apply([global, active]) as tf.SymbolicTensor;

    //#endregion

    //#region Output.

    const actionMove = actionValue({
        name,
        label: "action/move",
        numActions: numMoves,
        inputDim: moveUnits,
        // Note: Slicing through both teams and pokemon list to get first active
        // override traits, i.e. direct move features.
        sliceArgs: {begin: [0, 0], size: [1, 1]},
        units: 256,
        ...(config?.dist && {atoms: config.dist}),
        ...(random && {random}),
    })(moveset, global);

    const actionSwitch = actionValue({
        name,
        label: "action/switch",
        numActions: teamSize - numActive,
        inputDim: benchUnits,
        sliceArgs: {begin: 0, size: 1},
        units: 256,
        ...(config?.dist && {atoms: config.dist}),
        ...(random && {random}),
    })(bench, global);

    const advantage = tf.layers
        .concatenate({name: `${name}/action/concat`, axis: 1})
        .apply([actionMove, actionSwitch]) as tf.SymbolicTensor;

    let q: tf.SymbolicTensor;
    if (!config?.dueling) {
        q = advantage;
    } else {
        const value = stateValue({
            name,
            label: "state",
            units: 256,
            ...(config.dist && {atoms: config.dist}),
            ...(random && {random}),
        })(global);

        q = qDueling(name, "action")(advantage, value);
    }
    q = qValue(name, "q_val", config?.dist)(q);

    //#endregion

    const model = tf.model({name, inputs, outputs: [q]});
    const metadata: ModelMetadata = {
        ...(config && {config}),
        ...(seed && {seed}),
    };
    model.setUserDefinedMetadata(metadata);
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
    const {
        inputs: [input],
        features: [features],
    } = inputFeaturesList(name, [label], units, random);
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
    const features = inputs.map(input => {
        input = denseLayer.apply(input) as tf.SymbolicTensor;
        input = activationLayer.apply(input) as tf.SymbolicTensor;
        return input;
    });
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
function splitActiveAndPokemon(
    name: string,
    label: string,
    units: number,
): (
    features: tf.SymbolicTensor,
) => Record<"active" | "bench", tf.SymbolicTensor> {
    // [2,7,X] -> [2,2,X], [2,5,X]
    const splitLayer = customLayers.split({
        name: `${name}/${label}/split`,
        // Note: Have to account for both override and base trait vectors for
        // each active pokemon.
        numOrSizeSplits: [numActive * 2, teamSize - numActive],
        axis: 1,
    });
    // [2,2,X] -> [2,1,2*X]
    const activeReshapeLayer = tf.layers.reshape({
        name: `${name}/${label}/split/active/reshape`,
        targetShape: [numTeams, numActive, units * 2],
    });
    return function splitPokemonImpl(features) {
        const [active, bench] = splitLayer.apply(
            features,
        ) as tf.SymbolicTensor[];
        return {
            active: activeReshapeLayer.apply(active) as tf.SymbolicTensor,
            bench,
        };
    };
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
function splitPokemon(
    name: string,
    label: string,
): (
    features: tf.SymbolicTensor,
) => Record<"active" | "bench", tf.SymbolicTensor> {
    // [2,6,X] -> [2,1,X], [2,5,X]
    const splitLayer = customLayers.split({
        name: `${name}/${label}/split`,
        numOrSizeSplits: [numActive, teamSize - numActive],
        axis: 1,
    });
    return function splitBenchImpl(features) {
        const [active, bench] = splitLayer.apply(
            features,
        ) as tf.SymbolicTensor[];
        return {active, bench};
    };
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

/** Args for {@link actionValue}. */
interface ActionValueArgs {
    /** Name of model. */
    name: string;
    /** Name of module. */
    label: string;
    /** Number of possible actions. */
    numActions: number;
    /** Size of input features for each action. */
    inputDim: number;
    /** Args for slicing the local feature tensor. */
    sliceArgs: customLayers.SliceArgs;
    /** Hidden layer size. */
    units: number;
    /**
     * If defined, the function will compute a pre-softmax value distribution
     * for each action rather than a single value per action. The number
     * specifies the number of atoms with which to construct the support of the
     * value distribution.
     */
    atoms?: number;
    /** Optional seeder for weight init. */
    random?: Rng;
}

/**
 * Creates a layer that computes a value for each action.
 *
 * Takes a local input feature vector of shape `[B, N, U]` as well as the
 * aggregate global feature vector of shape `[B, G]` and computes the advantage
 * of each of the `N` actions, of shape `[B, N]`.
 */
function actionValue({
    name,
    label,
    numActions,
    inputDim,
    sliceArgs,
    units,
    atoms,
    random,
}: ActionValueArgs): (
    local: tf.SymbolicTensor,
    global: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    // Note: Should only consider actions for client's side (index 0).
    const localSliceLayer = customLayers.slice({
        name: `${name}/${label}/local/slice`,
        ...sliceArgs,
    });
    const localReshapeLayer = tf.layers.reshape({
        name: `${name}/${label}/local/reshape`,
        targetShape: [numActions, inputDim],
    });
    const globalRepeatLayer = tf.layers.repeatVector({
        name: `${name}/${label}/global/repeat`,
        n: numActions,
    });
    const concatLayer = tf.layers.concatenate({
        name: `${name}/${label}/concat`,
        axis: -1,
    });
    const denseLayer1 = tf.layers.dense({
        name: `${name}/${label}/dense_1`,
        units,
        kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/leaky_relu`,
    });
    const denseLayer2 = tf.layers.dense({
        name: `${name}/${label}/dense_2`,
        units: atoms ?? 1,
        activation: "linear",
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const reshapeLayer =
        !atoms &&
        tf.layers.reshape({
            name: `${name}/${label}/reshape`,
            targetShape: [numActions],
        });
    return function actionValuesImpl(local, global) {
        local = localSliceLayer.apply(local) as tf.SymbolicTensor;
        local = localReshapeLayer.apply(local) as tf.SymbolicTensor;
        global = globalRepeatLayer.apply(global) as tf.SymbolicTensor;
        let values = concatLayer.apply([local, global]) as tf.SymbolicTensor;
        values = denseLayer1.apply(values) as tf.SymbolicTensor;
        values = activationLayer.apply(values) as tf.SymbolicTensor;
        values = denseLayer2.apply(values) as tf.SymbolicTensor;
        if (reshapeLayer) {
            values = reshapeLayer.apply(values) as tf.SymbolicTensor;
        }
        return values;
    };
}

/** Args for {@link stateValue}. */
interface StateValueArgs {
    /** Name of model. */
    name: string;
    /** Name of module. */
    label: string;
    /** Hidden layer size. */
    units: number;
    /**
     * If defined, the function will compute a pre-softmax value distribution
     * for the state rather than a single value. The number specifies the
     * number of atoms with which to construct the support of the value
     * distribution.
     */
    atoms?: number;
    /** Optional seeder for weight init. */
    random?: Rng;
}

/**
 * Creates a layer that computes the value of the state.
 *
 * @returns A function to compute the state value distribution using global
 * features.
 */
function stateValue({
    name,
    label,
    units,
    atoms,
    random,
}: StateValueArgs): (global: tf.SymbolicTensor) => tf.SymbolicTensor {
    const denseLayer1 = tf.layers.dense({
        name: `${name}/${label}/value/dense_1`,
        units,
        kernelInitializer: tf.initializers.heNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    const activationLayer = tf.layers.leakyReLU({
        name: `${name}/${label}/value/leaky_relu`,
    });
    const denseLayer2 = tf.layers.dense({
        name: `${name}/${label}/value/dense_2`,
        units: atoms ?? 1,
        kernelInitializer: tf.initializers.glorotNormal({seed: random?.()}),
        biasInitializer: "zeros",
    });
    // Ensure broadcast with dueling.
    const reshapeLayer = atoms
        ? tf.layers.reshape({
              name: `${name}/${label}/value/reshape`,
              targetShape: [1, atoms],
          })
        : undefined;
    return function stateValueImpl(features) {
        features = denseLayer1.apply(features) as tf.SymbolicTensor;
        features = activationLayer.apply(features) as tf.SymbolicTensor;
        features = denseLayer2.apply(features) as tf.SymbolicTensor;
        features =
            (reshapeLayer?.apply(features) as tf.SymbolicTensor) ?? features;
        return features;
    };
}

/**
 * Creates a layer that computes the Q-value from action advantages.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @param atoms If defined, the function will compute the softmax value
 * distribution for each action rather than a single value per action. The
 * number specifies the number of atoms with which to construct the support of
 * the value distribution.
 * @returns A function to compute the Q-values.
 */
function qValue(
    name: string,
    label: string,
    atoms?: number,
): (advantage: tf.SymbolicTensor) => tf.SymbolicTensor {
    const activationLayer = atoms
        ? tf.layers.softmax({name: `${name}/${label}/softmax`, axis: -1})
        : tf.layers.activation({
              // Reward in range [-1, 1].
              name: `${name}/${label}/tanh`,
              activation: "tanh",
          });
    return advantage => activationLayer.apply(advantage) as tf.SymbolicTensor;
}

/**
 * Creates a layer that adds dueling Q network logic before applying the
 * {@link qValue} layer.
 *
 * @param name Name of model.
 * @param label Name of module.
 * @returns A function to compute the Q-values from action advantages and state
 * value using a dueling architecture.
 */
function qDueling(
    name: string,
    label: string,
): (
    advantage: tf.SymbolicTensor,
    value: tf.SymbolicTensor,
) => tf.SymbolicTensor {
    const meanAdvLayer = customLayers.mean({
        name: `${name}/${label}/mean`,
        axis: 1,
        // Ensure broadcast with dueling.
        keepDims: true,
    });
    const advSubLayer = customLayers.sub({name: `${name}/${label}/sub`});
    const qAddLayer = tf.layers.add({name: `${name}/${label}/add`});
    return function duelingImpl(advantage, value) {
        const meanAdv = meanAdvLayer.apply(advantage) as tf.SymbolicTensor;
        advantage = advSubLayer.apply([
            advantage,
            meanAdv,
        ]) as tf.SymbolicTensor;
        return qAddLayer.apply([advantage, value]) as tf.SymbolicTensor;
    };
}

/**
 * Verifies that the model is compatible with the input/output shapes as
 * specified by {@link modelInputShapes} and {@link modelOutputShape}.
 *
 * @throws Error if invalid input/output shapes.
 */
export function verifyModel(model: tf.LayersModel): void {
    const metadata = model.getUserDefinedMetadata() as
        | ModelMetadata
        | undefined;
    validateInput(model.input);
    validateOutput(model.output, metadata);
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
        if (shape[0] !== null) {
            throw new Error(
                `Input ${i} (${modelInputNames[i]}) is missing batch dimension`,
            );
        }
        tf.util.assertShapesMatch(
            [...modelInputShapes[i]],
            shape.slice(1) as number[],
            `Input ${i} (${modelInputNames[i]}) expected vs actual:`,
        );
    }
}

/** Ensures that the model output shape is valid. */
function validateOutput(
    output: tf.SymbolicTensor | tf.SymbolicTensor[],
    metadata?: ModelMetadata,
): void {
    if (Array.isArray(output)) {
        if (output.length !== 1) {
            throw new Error(`Expected 1 output but got ${output.length}`);
        }
        [output] = output;
    }
    const {shape} = output;
    if (shape[0] !== null) {
        throw new Error("Output is missing batch dimension");
    }
    tf.util.assertShapesMatch(
        metadata?.config?.dist
            ? [intToChoice.length, metadata.config.dist /*atoms*/]
            : [intToChoice.length],
        output.shape.slice(1) as number[],
        "Output expected vs actual:",
    );
}

/**
 * Creates a tensor for the support of the Q value distribution. Used for
 * distributional RL.
 *
 * @param atoms Number of atoms used to represent the distribution.
 */
export function createSupport(atoms: number): tf.Tensor1D {
    return tf.linspace(rewards.min, rewards.max, atoms);
}
