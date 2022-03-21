import * as tf from "@tensorflow/tfjs";
import {Moveset} from "../../psbot/handlers/battle/state/Moveset";
import {Team} from "../../psbot/handlers/battle/state/Team";
import * as customLayers from "./custom_layers";
import {modelInputShapesMap, verifyModel} from "./shapes";

// TODO: Control random weight/bias initializers for reproducibility.
/** Creates a default model for training. */
export function createModel(): tf.LayersModel {
    const inputs: tf.SymbolicTensor[] = [];
    const outputs: tf.SymbolicTensor[] = [];

    //#region Inputs and global/local feature connections.

    const globalFeatures: tf.SymbolicTensor[] = [];

    //#region Room status.

    const inputRoom = tf.layers.input({
        name: "model/input/room",
        shape: [...modelInputShapesMap["room"]],
    });
    inputs.push(inputRoom);
    const roomFeatures = tf.layers
        .dense({
            name: "model/room/dense",
            units: 8,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(inputRoom) as tf.SymbolicTensor;
    globalFeatures.push(roomFeatures);

    //#endregion

    //#region Team status.

    const inputTeamStatus = tf.layers.input({
        name: "model/input/team/status",
        shape: [...modelInputShapesMap["team/status"]],
    });
    inputs.push(inputTeamStatus);
    const teamStatusFeatures = tf.layers
        .dense({
            name: "model/team/status/dense",
            units: 16,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(inputTeamStatus) as tf.SymbolicTensor;
    globalFeatures.push(teamStatusFeatures);

    //#endregion

    //#region Team pokemon.

    //#region Shared layers between active/bench features.

    const pokemonSpeciesLayer = tf.layers.dense({
        name: "model/team/pokemon/species/dense",
        units: 64,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonTypesLayer = tf.layers.dense({
        name: "model/team/pokemon/types/dense",
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonStatsLayer = tf.layers.dense({
        name: "model/team/pokemon/stats/dense",
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonAbilityLayer = tf.layers.dense({
        name: "model/team/pokemon/ability/dense",
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonItemLayer = tf.layers.dense({
        name: "model/team/pokemon/item/dense",
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonMoveLayer = tf.layers.dense({
        name: "model/team/pokemon/moveset/move/dense",
        units: 32,
        activation: "relu",
        kernelInitializer: "heNormal",
        biasInitializer: "zeros",
    });

    const pokemonMovesetAggregateLayer = customLayers.mean({
        name: "model/team/pokemon/moveset/mean",
        axis: -2,
    });

    //#endregion

    //#region Active pokemon's volatile status and override traits.

    const activeVolatileInput = tf.layers.input({
        name: "model/input/team/active/volatile",
        shape: [...modelInputShapesMap["team/active/volatile"]],
    });
    inputs.push(activeVolatileInput);
    const activeVolatileFeatures = tf.layers
        .dense({
            name: "model/team/active/volatile/dense",
            units: 32,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(activeVolatileInput) as tf.SymbolicTensor;
    globalFeatures.push(activeVolatileFeatures);

    const activeSpeciesInput = tf.layers.input({
        name: "model/input/team/active/species",
        shape: [...modelInputShapesMap["team/active/species"]],
    });
    inputs.push(activeSpeciesInput);
    const activeSpeciesFeatures = pokemonSpeciesLayer.apply(
        activeSpeciesInput,
    ) as tf.SymbolicTensor;
    globalFeatures.push(activeSpeciesFeatures);

    const activeTypesInput = tf.layers.input({
        name: "model/input/team/active/types",
        shape: [...modelInputShapesMap["team/active/types"]],
    });
    inputs.push(activeTypesInput);
    const activeTypesFeatures = pokemonTypesLayer.apply(
        activeTypesInput,
    ) as tf.SymbolicTensor;
    globalFeatures.push(activeTypesFeatures);

    const activeStatsInput = tf.layers.input({
        name: "model/input/team/active/stats",
        shape: [...modelInputShapesMap["team/active/stats"]],
    });
    inputs.push(activeStatsInput);
    const activeStatsFeatures = pokemonStatsLayer.apply(
        activeStatsInput,
    ) as tf.SymbolicTensor;
    globalFeatures.push(activeStatsFeatures);

    const activeAbilityInput = tf.layers.input({
        name: "model/input/team/active/ability",
        shape: [...modelInputShapesMap["team/active/ability"]],
    });
    inputs.push(activeAbilityInput);
    const activeAbilityFeatures = pokemonAbilityLayer.apply(
        activeAbilityInput,
    ) as tf.SymbolicTensor;
    globalFeatures.push(activeAbilityFeatures);

    const activeMoveInput = tf.layers.input({
        name: "model/input/team/active/moves",
        shape: [...modelInputShapesMap["team/active/moves"]],
    });
    inputs.push(activeMoveInput);
    const activeMoveFeatures = pokemonMoveLayer.apply(
        activeMoveInput,
    ) as tf.SymbolicTensor;

    const activeMovesetAggregate = pokemonMovesetAggregateLayer.apply(
        activeMoveFeatures,
    ) as tf.SymbolicTensor;
    globalFeatures.push(activeMovesetAggregate);

    //#endregion

    //#region Bench pokemon's statuses and traits.

    const pokemonFeaturesList: tf.SymbolicTensor[] = [];

    //#region Inputs and basic individual features.

    // Note: Each input is of shape [null, num_teams, team_size, x] where x is
    // the encoder array size and the null stands for the batch size.
    // Then, the Dense layers are applied onto each x input individually.

    const basicInput = tf.layers.input({
        name: "model/input/team/pokemon/basic",
        shape: [...modelInputShapesMap["team/pokemon/basic"]],
    });
    inputs.push(basicInput);
    const basicFeatures = tf.layers
        .dense({
            name: "model/pokemon/basic/dense",
            units: 8,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(basicInput) as tf.SymbolicTensor;
    pokemonFeaturesList.push(basicFeatures);

    const speciesInput = tf.layers.input({
        name: "model/input/team/pokemon/species",
        shape: [...modelInputShapesMap["team/pokemon/species"]],
    });
    inputs.push(speciesInput);
    const speciesFeatures = pokemonSpeciesLayer.apply(
        speciesInput,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(speciesFeatures);

    const typesInput = tf.layers.input({
        name: "model/input/team/pokemon/types",
        shape: [...modelInputShapesMap["team/pokemon/types"]],
    });
    inputs.push(typesInput);
    const typesFeatures = pokemonTypesLayer.apply(
        typesInput,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(typesFeatures);

    const statsInput = tf.layers.input({
        name: "model/input/team/pokemon/stats",
        shape: [...modelInputShapesMap["team/pokemon/stats"]],
    });
    inputs.push(statsInput);
    const statsFeatures = pokemonStatsLayer.apply(
        statsInput,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(statsFeatures);

    const abilityInput = tf.layers.input({
        name: "model/input/team/pokemon/ability",
        shape: [...modelInputShapesMap["team/pokemon/ability"]],
    });
    inputs.push(abilityInput);
    const abilityFeatures = pokemonAbilityLayer.apply(
        abilityInput,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(abilityFeatures);

    const itemInput = tf.layers.input({
        name: "model/input/team/pokemon/item",
        shape: [...modelInputShapesMap["team/pokemon/item"]],
    });
    inputs.push(itemInput);
    const itemFeatures = pokemonItemLayer.apply(itemInput) as tf.SymbolicTensor;
    pokemonFeaturesList.push(itemFeatures);

    const lastItemInput = tf.layers.input({
        name: "model/input/team/pokemon/last_item",
        shape: [...modelInputShapesMap["team/pokemon/last_item"]],
    });
    inputs.push(lastItemInput);
    const lastItemFeatures = pokemonItemLayer.apply(
        lastItemInput,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(lastItemFeatures);

    const moveInput = tf.layers.input({
        name: "model/input/team/pokemon/moves",
        shape: [...modelInputShapesMap["team/pokemon/moves"]],
    });
    inputs.push(moveInput);
    const moveFeatures = pokemonMoveLayer.apply(moveInput) as tf.SymbolicTensor;
    const movesetAggregate = pokemonMovesetAggregateLayer.apply(
        moveFeatures,
    ) as tf.SymbolicTensor;
    pokemonFeaturesList.push(movesetAggregate);

    //#endregion

    // Afterwards, each of the [null, num_teams, team_size, x] input
    // features are concatenated into a single tensor of shape
    // [null, num_teams, team_size, y].
    const pokemonConcat = tf.layers
        .concatenate({
            name: "model/team/pokemon/concat",
            axis: -1,
        })
        .apply(pokemonFeaturesList) as tf.SymbolicTensor;

    // Here we element-wise average each of the pokemon features to remove
    // dependency on order.
    // TODO: Should we exclude the active pokemon's base traits?
    const teamPokemonAggregate = customLayers
        .mean({
            name: "model/team/pokemon/mean",
            axis: -2,
        })
        .apply(pokemonConcat) as tf.SymbolicTensor;
    globalFeatures.push(teamPokemonAggregate);

    //#endregion

    //#endregion

    const globalFlattenLayer = tf.layers.flatten({
        name: "model/global/flatten",
    });
    const globalFeaturesFlattened = globalFeatures.map(st =>
        st.rank === 2
            ? st
            : (globalFlattenLayer.apply(st) as tf.SymbolicTensor),
    );

    const globalConcat = tf.layers
        .concatenate({
            name: "model/global/concat",
            axis: -1,
        })
        .apply(globalFeaturesFlattened) as tf.SymbolicTensor;
    const globalEncoding = tf.layers
        .dense({
            name: "model/global/dense",
            units: 64,
            activation: "relu",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(globalConcat) as tf.SymbolicTensor;

    //#endregion

    //#region Output Q-values.

    const actionFeatures: tf.SymbolicTensor[] = [];

    //#region Move choices.

    // Extract move features from our side.
    const usMoveFeaturesSlice = customLayers
        .slice({
            name: "model/action/move/local/slice",
            begin: 0,
            size: 1,
        })
        .apply(activeMoveFeatures) as tf.SymbolicTensor;
    // Also remove the extra team dimension due to slice op.
    const usMoveFeatures = tf.layers
        .reshape({
            name: "model/action/move/local/reshape",
            targetShape: usMoveFeaturesSlice.shape.slice(2),
        })
        .apply(usMoveFeaturesSlice) as tf.SymbolicTensor;

    // Consider both the global features as well as the move itself.
    const actionMoveGlobalRepeat = tf.layers
        .repeatVector({
            name: "model/action/move/global/repeat",
            n: Moveset.maxSize,
        })
        .apply(globalEncoding) as tf.SymbolicTensor;
    const actionMoveConcat = tf.layers
        .concatenate({
            name: "model/action/move/concat",
            axis: -1,
        })
        .apply([actionMoveGlobalRepeat, usMoveFeatures]) as tf.SymbolicTensor;

    const actionMove = tf.layers
        .dense({
            name: "model/action/move/dense",
            units: 1,
            activation: "linear",
            kernelInitializer: "glorotNormal",
            biasInitializer: "zeros",
        })
        .apply(actionMoveConcat) as tf.SymbolicTensor;
    const actionMoves = tf.layers
        .reshape({
            name: "model/action/move/reshape",
            targetShape: [Moveset.maxSize],
        })
        .apply(actionMove) as tf.SymbolicTensor;
    actionFeatures.push(actionMoves);

    //#endregion

    //#region Switch choices.

    // Extract bench features from our team except active mon.
    const actionSwitchBenchSlice = customLayers
        .slice({
            name: "model/action/switch/bench/slice",
            begin: [0, 1],
            size: 1,
        })
        .apply(pokemonConcat) as tf.SymbolicTensor;
    // Also remove the extra team dimension due to slice op.
    const actionSwitchBench = tf.layers
        .reshape({
            name: "model/action/switch/bench/reshape",
            targetShape: actionSwitchBenchSlice.shape.slice(2),
        })
        .apply(actionSwitchBenchSlice) as tf.SymbolicTensor;

    // Consider both the global features as well as the bench mon itself.
    const actionSwitchGlobalRepeat = tf.layers
        .repeatVector({
            name: "model/action/switch/global/repeat",
            n: Team.maxSize - 1,
        })
        .apply(globalEncoding) as tf.SymbolicTensor;
    const actionSwitchConcat = tf.layers
        .concatenate({
            name: "model/action/switch/concat",
            axis: -1,
        })
        .apply([
            actionSwitchGlobalRepeat,
            actionSwitchBench,
        ]) as tf.SymbolicTensor;

    const actionSwitch = tf.layers
        .dense({
            name: "model/action/switch/dense",
            units: 1,
            activation: "linear",
            kernelInitializer: "heNormal",
            biasInitializer: "zeros",
        })
        .apply(actionSwitchConcat) as tf.SymbolicTensor;
    const actionSwitches = tf.layers
        .reshape({
            name: "model/action/switch/reshape",
            targetShape: [Team.maxSize - 1],
        })
        .apply(actionSwitch) as tf.SymbolicTensor;
    actionFeatures.push(actionSwitches);

    //#endregion

    const outputActionConcat = tf.layers
        .concatenate({
            name: "model/output/action",
            axis: -1,
        })
        .apply(actionFeatures) as tf.SymbolicTensor;
    outputs.push(outputActionConcat);

    //#endregion

    const model = tf.model({name: "model", inputs, outputs});
    // Consistency check.
    verifyModel(model);
    return model;
}
