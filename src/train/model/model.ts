import * as tf from "@tensorflow/tfjs";
import {Moveset} from "../../psbot/handlers/battle/state/Moveset";
import {Team} from "../../psbot/handlers/battle/state/Team";
import * as customLayers from "./custom_layers";
import {modelInputShapesMap, verifyModel} from "./shapes";

// TODO: Control random weight/bias initializers for reproducibility.
/** Creates a default model for training. */
export function createModel(name: string): tf.LayersModel {
    const inputs: tf.SymbolicTensor[] = [];

    //#region Inputs and local feature connections.

    const globalFeatures: tf.SymbolicTensor[] = [];

    const roomStatus = inputRoomStatus(name);
    inputs.push(roomStatus.input);
    globalFeatures.push(roomStatus.features);

    const teamStatus = inputTeamStatus(name);
    inputs.push(teamStatus.input);
    globalFeatures.push(teamStatus.features);

    //#region Team pokemon.

    const species = inputSpecies(name);
    const types = inputTypes(name);
    const stats = inputStats(name);
    const ability = inputAbility(name);
    const moveset = inputMoveset(name);

    //#region Active pokemon's volatile status and override traits.

    const activeVolatile = inputActiveVolatile(name);
    inputs.push(activeVolatile.input);
    globalFeatures.push(activeVolatile.features);

    inputs.push(species.active.input);
    globalFeatures.push(species.active.features);

    inputs.push(types.active.input);
    globalFeatures.push(types.active.features);

    inputs.push(stats.active.input);
    globalFeatures.push(stats.active.features);

    inputs.push(ability.active.input);
    globalFeatures.push(ability.active.features);

    inputs.push(moveset.active.input);
    globalFeatures.push(moveset.active.features);

    //#endregion

    //#region Bench pokemon's statuses and traits.

    const pokemonFeaturesList: tf.SymbolicTensor[] = [];

    const benchAliveInput = inputBenchAlive(name);
    inputs.push(benchAliveInput);

    //#region Inputs and basic individual features.

    const benchBasic = inputBenchBasic(name);
    inputs.push(benchBasic.input);
    pokemonFeaturesList.push(benchBasic.features);

    inputs.push(species.bench.input);
    pokemonFeaturesList.push(species.bench.features);

    inputs.push(types.bench.input);
    pokemonFeaturesList.push(types.bench.features);

    inputs.push(stats.bench.input);
    pokemonFeaturesList.push(stats.bench.features);

    inputs.push(ability.bench.input);
    pokemonFeaturesList.push(ability.bench.features);

    const item = inputItem(name);
    inputs.push(...item.inputs);
    pokemonFeaturesList.push(...item.features);

    inputs.push(moveset.bench.input);
    pokemonFeaturesList.push(moveset.bench.features);

    //#endregion

    // Aggregate step.
    const {individual: pokemonFeatures, aggregate: teamPokemonAggregate} =
        aggregateTeamPokemonFeatures(
            name,
            pokemonFeaturesList,
            benchAliveInput,
        );
    globalFeatures.push(teamPokemonAggregate);

    //#endregion

    //#endregion

    //#endregion

    //#region Global feature connections.

    const globalEncoding = aggregateGlobalFeatures(name, globalFeatures);

    //#endregion

    //#region Output Q-values.

    const actionMove = modelActionMove(
        name,
        moveset.active.individualFeatures,
        globalEncoding,
    );

    const actionSwitch = modelActionSwitch(
        name,
        pokemonFeatures,
        globalEncoding,
    );

    const outputAction = aggregateActionOutput(name, [
        actionMove,
        actionSwitch,
    ]);

    //#endregion

    const model = tf.model({name, inputs, outputs: [outputAction]});
    // Consistency check.
    verifyModel(model);
    return model;
}

/**
 * Intermediate data structure representing the inputs and outputs of a
 * subsection of the first layer of processing in the main model.
 */
interface InputFeatures {
    input: tf.SymbolicTensor;
    features: tf.SymbolicTensor;
}

function inputRoomStatus(name: string): InputFeatures {
    const roomStatusInput = tf.layers.input({
        name: `${name}/input/room`,
        shape: [...modelInputShapesMap["room"]],
    });
    const roomStatusFeatures = tf.layers
        .dense({
            name: `${name}/room/dense`,
            units: 8,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(roomStatusInput) as tf.SymbolicTensor;
    return {input: roomStatusInput, features: roomStatusFeatures};
}

function inputTeamStatus(name: string): InputFeatures {
    const teamStatusInput = tf.layers.input({
        name: `${name}/input/team/status`,
        shape: [...modelInputShapesMap["team/status"]],
    });
    const teamStatusFeatures = tf.layers
        .dense({
            name: `${name}/team/status/dense`,
            units: 16,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(teamStatusInput) as tf.SymbolicTensor;
    return {input: teamStatusInput, features: teamStatusFeatures};
}

function inputActiveVolatile(name: string): InputFeatures {
    const activeVolatileInput = tf.layers.input({
        name: `${name}/input/team/active/volatile`,
        shape: [...modelInputShapesMap["team/active/volatile"]],
    });
    const activeVolatileFeatures = tf.layers
        .dense({
            name: `${name}/team/active/volatile/dense`,
            units: 32,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(activeVolatileInput) as tf.SymbolicTensor;
    return {input: activeVolatileInput, features: activeVolatileFeatures};
}

function inputBenchAlive(name: string): tf.SymbolicTensor {
    const benchAliveInput = tf.layers.input({
        name: `${name}/input/team/pokemon/alive`,
        shape: [...modelInputShapesMap["team/pokemon/alive"]],
    });
    return benchAliveInput;
}

function inputBenchBasic(name: string): InputFeatures {
    const benchBasicInput = tf.layers.input({
        name: `${name}/input/team/pokemon/basic`,
        shape: [...modelInputShapesMap["team/pokemon/basic"]],
    });
    const benchBasicFeatures = tf.layers
        .dense({
            name: `${name}/pokemon/basic/dense`,
            units: 8,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(benchBasicInput) as tf.SymbolicTensor;
    return {input: benchBasicInput, features: benchBasicFeatures};
}

/** Input features for both active and bench pokemon, using shared weights. */
type TeamInputFeatures = Record<"active" | "bench", InputFeatures>;

function inputSpecies(name: string): TeamInputFeatures {
    const pokemonSpeciesLayer = tf.layers.dense({
        name: `${name}/team/pokemon/species/dense`,
        units: 64,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const activeSpeciesInput = tf.layers.input({
        name: `${name}/input/team/active/species`,
        shape: [...modelInputShapesMap["team/active/species"]],
    });
    const activeSpeciesFeatures = pokemonSpeciesLayer.apply(
        activeSpeciesInput,
    ) as tf.SymbolicTensor;

    const benchSpeciesInput = tf.layers.input({
        name: `${name}/input/team/pokemon/species`,
        shape: [...modelInputShapesMap["team/pokemon/species"]],
    });
    const benchSpeciesFeatures = pokemonSpeciesLayer.apply(
        benchSpeciesInput,
    ) as tf.SymbolicTensor;

    return {
        active: {input: activeSpeciesInput, features: activeSpeciesFeatures},
        bench: {input: benchSpeciesInput, features: benchSpeciesFeatures},
    };
}

function inputTypes(name: string): TeamInputFeatures {
    const pokemonTypesLayer = tf.layers.dense({
        name: `${name}/team/pokemon/types/dense`,
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const activeTypesInput = tf.layers.input({
        name: `${name}/input/team/active/types`,
        shape: [...modelInputShapesMap["team/active/types"]],
    });
    const activeTypesFeatures = pokemonTypesLayer.apply(
        activeTypesInput,
    ) as tf.SymbolicTensor;

    const benchTypesInput = tf.layers.input({
        name: `${name}/input/team/pokemon/types`,
        shape: [...modelInputShapesMap["team/pokemon/types"]],
    });
    const benchTypesFeatures = pokemonTypesLayer.apply(
        benchTypesInput,
    ) as tf.SymbolicTensor;

    return {
        active: {input: activeTypesInput, features: activeTypesFeatures},
        bench: {input: benchTypesInput, features: benchTypesFeatures},
    };
}

function inputStats(name: string): TeamInputFeatures {
    const pokemonStatsLayer = tf.layers.dense({
        name: `${name}/team/pokemon/stats/dense`,
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const activeStatsInput = tf.layers.input({
        name: `${name}/input/team/active/stats`,
        shape: [...modelInputShapesMap["team/active/stats"]],
    });
    const activeStatsFeatures = pokemonStatsLayer.apply(
        activeStatsInput,
    ) as tf.SymbolicTensor;

    const benchStatsInput = tf.layers.input({
        name: `${name}/input/team/pokemon/status`,
        shape: [...modelInputShapesMap["team/pokemon/stats"]],
    });
    const benchStatsFeatures = pokemonStatsLayer.apply(
        benchStatsInput,
    ) as tf.SymbolicTensor;

    return {
        active: {input: activeStatsInput, features: activeStatsFeatures},
        bench: {input: benchStatsInput, features: benchStatsFeatures},
    };
}

function inputAbility(name: string): TeamInputFeatures {
    const pokemonAbilityLayer = tf.layers.dense({
        name: `${name}/team/pokemon/ability/dense`,
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const activeAbilityInput = tf.layers.input({
        name: `${name}/input/team/active/ability`,
        shape: [...modelInputShapesMap["team/active/ability"]],
    });
    const activeAbilityFeatures = pokemonAbilityLayer.apply(
        activeAbilityInput,
    ) as tf.SymbolicTensor;

    const benchAbilityInput = tf.layers.input({
        name: `${name}/input/team/pokemon/ability`,
        shape: [...modelInputShapesMap["team/pokemon/ability"]],
    });
    const benchAbilityFeatures = pokemonAbilityLayer.apply(
        benchAbilityInput,
    ) as tf.SymbolicTensor;

    return {
        active: {input: activeAbilityInput, features: activeAbilityFeatures},
        bench: {input: benchAbilityInput, features: benchAbilityFeatures},
    };
}

/** Input features for {@link inputMoveset moveset}. */
interface MovesetInputFeatures {
    active: InputFeatures & {individualFeatures: tf.SymbolicTensor};
    bench: InputFeatures;
}

function inputMoveset(name: string): MovesetInputFeatures {
    const pokemonMoveLayer = tf.layers.dense({
        name: `${name}/team/pokemon/moveset/move/dense`,
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });
    const pokemonMovesetAggregateLayer = customLayers.mean({
        name: `${name}/team/pokemon/moveset/mean`,
        axis: -2,
    });

    const activeMoveInput = tf.layers.input({
        name: `${name}/input/team/active/moves`,
        shape: [...modelInputShapesMap["team/active/moves"]],
    });
    const activeMoveFeatures = pokemonMoveLayer.apply(
        activeMoveInput,
    ) as tf.SymbolicTensor;
    const activeMovesetAggregate = pokemonMovesetAggregateLayer.apply(
        activeMoveFeatures,
    ) as tf.SymbolicTensor;

    const benchMoveInput = tf.layers.input({
        name: `${name}/input/team/pokemon/moves`,
        shape: [...modelInputShapesMap["team/pokemon/moves"]],
    });
    const benchMoveFeatures = pokemonMoveLayer.apply(
        benchMoveInput,
    ) as tf.SymbolicTensor;
    const benchMovesetAggregate = pokemonMovesetAggregateLayer.apply(
        benchMoveFeatures,
    ) as tf.SymbolicTensor;

    return {
        active: {
            input: activeMoveInput,
            features: activeMovesetAggregate,
            individualFeatures: activeMoveFeatures,
        },
        bench: {input: benchMoveInput, features: benchMovesetAggregate},
    };
}

/** Input features with multiple inputs/outputs. */
interface InputFeaturesList {
    inputs: tf.SymbolicTensor[];
    features: tf.SymbolicTensor[];
}

function inputItem(name: string): InputFeaturesList {
    const pokemonItemLayer = tf.layers.dense({
        name: `${name}/team/pokemon/item/dense`,
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const itemInput = tf.layers.input({
        name: `${name}/input/team/pokemon/item`,
        shape: [...modelInputShapesMap["team/pokemon/item"]],
    });
    const itemFeatures = pokemonItemLayer.apply(itemInput) as tf.SymbolicTensor;

    const lastItemInput = tf.layers.input({
        name: `${name}/input/team/pokemon/last_item`,
        shape: [...modelInputShapesMap["team/pokemon/last_item"]],
    });
    const lastItemFeatures = pokemonItemLayer.apply(
        lastItemInput,
    ) as tf.SymbolicTensor;

    return {
        inputs: [itemInput, lastItemInput],
        features: [itemFeatures, lastItemFeatures],
    };
}

interface TeamPokemonAggregateFeatures {
    individual: tf.SymbolicTensor;
    aggregate: tf.SymbolicTensor;
}

function aggregateTeamPokemonFeatures(
    name: string,
    pokemonFeaturesList: tf.SymbolicTensor[],
    benchAliveInput: tf.SymbolicTensor,
): TeamPokemonAggregateFeatures {
    // Each of the [batch, num_teams, team_size, x] input features are
    // concatenated into a single tensor of shape
    // [batch, num_teams, team_size, y].
    const pokemonFeatures = tf.layers
        .concatenate({
            name: `${name}/team/pokemon/concat`,
            axis: -1,
        })
        .apply(pokemonFeaturesList) as tf.SymbolicTensor;

    // Mask out features of pokemon that are not alive or nonexistent.
    const pokemonFeaturesMasked = customLayers
        .mask({name: `${name}/team/pokemon/alive_masked`})
        .apply([pokemonFeatures, benchAliveInput]) as tf.SymbolicTensor;

    // Here we element-wise average each of the pokemon features to remove
    // dependency on order, so we get a shape [batch, num_teams, y] tensor.
    // TODO: Should we exclude the active pokemon's base traits?
    const teamPokemonAggregate = customLayers
        .mean({
            name: `${name}/team/pokemon/mean`,
            axis: -2,
        })
        .apply(pokemonFeaturesMasked) as tf.SymbolicTensor;

    return {
        individual: pokemonFeaturesMasked,
        aggregate: teamPokemonAggregate,
    };
}

function aggregateGlobalFeatures(
    name: string,
    globalFeatures: tf.SymbolicTensor[],
): tf.SymbolicTensor {
    const globalFlattenLayer = tf.layers.flatten({
        name: `${name}/global/flatten`,
    });
    const globalFeaturesFlattened = globalFeatures.map(st =>
        st.rank === 2
            ? st
            : (globalFlattenLayer.apply(st) as tf.SymbolicTensor),
    );

    const globalConcat = tf.layers
        .concatenate({
            name: `${name}/global/concat`,
            axis: -1,
        })
        .apply(globalFeaturesFlattened) as tf.SymbolicTensor;
    const globalEncoding = tf.layers
        .dense({
            name: `${name}/global/dense`,
            units: 64,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(globalConcat) as tf.SymbolicTensor;
    return globalEncoding;
}

function modelActionMove(
    name: string,
    activeMoveFeatures: tf.SymbolicTensor,
    globalEncoding: tf.SymbolicTensor,
): tf.SymbolicTensor {
    // Extract move features from our side.
    const usMoveFeaturesSlice = customLayers
        .slice({
            name: `${name}/action/move/local/slice`,
            begin: 0,
            size: 1,
        })
        .apply(activeMoveFeatures) as tf.SymbolicTensor;
    // Also remove the extra team dimension due to slice op.
    const usMoveFeatures = tf.layers
        .reshape({
            name: `${name}/action/move/local/reshape`,
            targetShape: usMoveFeaturesSlice.shape.slice(2),
        })
        .apply(usMoveFeaturesSlice) as tf.SymbolicTensor;

    // Broadcast the global feature tensor to each active move choice.
    const actionMoveGlobalRepeat = tf.layers
        .repeatVector({
            name: `${name}/action/move/global/repeat`,
            n: Moveset.maxSize,
        })
        .apply(globalEncoding) as tf.SymbolicTensor;

    const actionMoveConcat = tf.layers
        .concatenate({
            name: `${name}/action/move/concat`,
            axis: -1,
        })
        .apply([actionMoveGlobalRepeat, usMoveFeatures]) as tf.SymbolicTensor;

    const actionMove = tf.layers
        .dense({
            name: `${name}/action/move/dense`,
            units: 1,
            activation: "linear",
            kernelInitializer: "glorotNormal",
            biasInitializer: "zeros",
        })
        .apply(actionMoveConcat) as tf.SymbolicTensor;
    const actionMoves = tf.layers
        .reshape({
            name: `${name}/action/move/reshape`,
            targetShape: [Moveset.maxSize],
        })
        .apply(actionMove) as tf.SymbolicTensor;
    return actionMoves;
}

function modelActionSwitch(
    name: string,
    pokemonFeatures: tf.SymbolicTensor,
    globalEncoding: tf.SymbolicTensor,
): tf.SymbolicTensor {
    // Extract bench features from our team except active mon.
    const actionSwitchBenchSlice = customLayers
        .slice({
            name: `${name}/action/switch/bench/slice`,
            begin: [0, 1],
            size: 1,
        })
        .apply(pokemonFeatures) as tf.SymbolicTensor;
    // Also remove the extra team dimension due to slice op.
    const actionSwitchBench = tf.layers
        .reshape({
            name: `${name}/action/switch/bench/reshape`,
            targetShape: actionSwitchBenchSlice.shape.slice(2),
        })
        .apply(actionSwitchBenchSlice) as tf.SymbolicTensor;

    // Broadcast the global feature tensor to each bench switch choice.
    const actionSwitchGlobalRepeat = tf.layers
        .repeatVector({
            name: `${name}/action/switch/global/repeat`,
            n: Team.maxSize - 1,
        })
        .apply(globalEncoding) as tf.SymbolicTensor;

    const actionSwitchConcat = tf.layers
        .concatenate({
            name: `${name}/action/switch/concat`,
            axis: -1,
        })
        .apply([
            actionSwitchGlobalRepeat,
            actionSwitchBench,
        ]) as tf.SymbolicTensor;

    const actionSwitch = tf.layers
        .dense({
            name: `${name}/action/switch/dense`,
            units: 1,
            activation: "linear",
            kernelInitializer: "glorotNormal",
            biasInitializer: "zeros",
        })
        .apply(actionSwitchConcat) as tf.SymbolicTensor;
    const actionSwitches = tf.layers
        .reshape({
            name: `${name}/action/switch/reshape`,
            targetShape: [Team.maxSize - 1],
        })
        .apply(actionSwitch) as tf.SymbolicTensor;
    return actionSwitches;
}

function aggregateActionOutput(
    name: string,
    actionFeatures: tf.SymbolicTensor[],
): tf.SymbolicTensor {
    const outputActionConcat = tf.layers
        .concatenate({
            name: `${name}/output/action`,
            axis: -1,
        })
        .apply(actionFeatures) as tf.SymbolicTensor;
    return outputActionConcat;
}
