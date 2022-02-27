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

    //#region Base layers for weight sharing.

    const teamStatusLayer = tf.layers.dense({
        name: "model/team/status/dense",
        units: 16,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const volatileLayer = tf.layers.dense({
        name: "model/team/active/volatile/dense",
        units: 32,
        // TODO: Separate into basic statuses and override traits.
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonBasicLayer = tf.layers.dense({
        name: "model/pokemon/basic/dense",
        units: 8,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonSpeciesLayer = tf.layers.dense({
        name: "model/team/pokemon/species/dense",
        units: 64,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonTypesLayer = tf.layers.dense({
        name: "model/team/pokemon/types/dense",
        units: 32,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonStatsLayer = tf.layers.dense({
        name: "model/team/pokemon/stats/dense",
        units: 32,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonAbilityLayer = tf.layers.dense({
        name: "model/team/pokemon/ability/dense",
        units: 32,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonItemLayer = tf.layers.dense({
        name: "model/team/pokemon/item/dense",
        units: 32,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonMoveLayer = tf.layers.dense({
        name: "model/team/pokemon/moveset/move/dense",
        units: 32,
        activation: "tanh",
        kernelInitializer: "heNormal",
        biasInitializer: "heNormal",
    });

    const pokemonMovesetAggregateLayer = customLayers.mean({
        name: "model/team/pokemon/moveset/mean",
        axis: -2,
    });

    const pokemonConcatLayer = tf.layers.concatenate({
        name: "model/team/pokemon/concat",
        axis: -1,
    });

    const teamPokemonAggregateLayer = customLayers.mean({
        name: "model/team/pokemon/mean",
        axis: -2,
    });

    //#endregion

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
            activation: "tanh",
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
        })
        .apply(inputRoom) as tf.SymbolicTensor;
    globalFeatures.push(roomFeatures);

    //#endregion

    let usMoveFeatures: tf.SymbolicTensor | undefined;
    let usPokemonFeatures: tf.SymbolicTensor | undefined;

    // TODO: Add another dimension for the number of sides?
    for (const side of ["us", "them"]) {
        //#region Team status.

        const inputTeamStatus = tf.layers.input({
            name: `model/input/${side}/status`,
            shape: [...modelInputShapesMap[`${side}/status`]],
        });
        inputs.push(inputTeamStatus);
        const teamStatusFeatures = teamStatusLayer.apply(
            inputTeamStatus,
        ) as tf.SymbolicTensor;
        globalFeatures.push(teamStatusFeatures);

        //#endregion

        //#region Active pokemon's volatile status and override traits.

        const activeVolatileInput = tf.layers.input({
            name: `model/input/${side}/active/volatile`,
            shape: [...modelInputShapesMap[`${side}/active/volatile`]],
        });
        inputs.push(activeVolatileInput);
        const activeVolatileFeatures = volatileLayer.apply(
            activeVolatileInput,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeVolatileFeatures);

        const activeSpeciesInput = tf.layers.input({
            name: `model/input/${side}/active/species`,
            shape: [...modelInputShapesMap[`${side}/active/species`]],
        });
        inputs.push(activeSpeciesInput);
        const activeSpeciesFeatures = pokemonSpeciesLayer.apply(
            activeSpeciesInput,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeSpeciesFeatures);

        const activeTypesInput = tf.layers.input({
            name: `model/input/${side}/active/types`,
            shape: [...modelInputShapesMap[`${side}/active/types`]],
        });
        inputs.push(activeTypesInput);
        const activeTypesFeatures = pokemonTypesLayer.apply(
            activeTypesInput,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeTypesFeatures);

        const activeStatsInput = tf.layers.input({
            name: `model/input/${side}/active/stats`,
            shape: [...modelInputShapesMap[`${side}/active/stats`]],
        });
        inputs.push(activeStatsInput);
        const activeStatsFeatures = pokemonStatsLayer.apply(
            activeStatsInput,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeStatsFeatures);

        const activeAbilityInput = tf.layers.input({
            name: `model/input/${side}/active/ability`,
            shape: [...modelInputShapesMap[`${side}/active/ability`]],
        });
        inputs.push(activeAbilityInput);
        const activeAbilityFeatures = pokemonAbilityLayer.apply(
            activeAbilityInput,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeAbilityFeatures);

        const activeMoveInput = tf.layers.input({
            name: `model/input/${side}/active/moves`,
            shape: [...modelInputShapesMap[`${side}/active/moves`]],
        });
        inputs.push(activeMoveInput);
        const activeMoveFeatures = pokemonMoveLayer.apply(
            activeMoveInput,
        ) as tf.SymbolicTensor;

        // Save active move data for move choice evaluation at the output.
        if (side === "us") {
            usMoveFeatures = activeMoveFeatures;
        }

        const activeMovesetAggregate = pokemonMovesetAggregateLayer.apply(
            activeMoveFeatures,
        ) as tf.SymbolicTensor;
        globalFeatures.push(activeMovesetAggregate);

        //#endregion

        //#region Bench pokemon's statuses and traits.

        const pokemonFeaturesList: tf.SymbolicTensor[] = [];

        //#region Inputs and basic individual features.

        // Note: Each input is of shape [null, team_size, x] where x is the
        // encoder array size and the null stands for the batch size.
        // Then, the Dense layers are applied onto each x input individually.

        const basicInput = tf.layers.input({
            name: `model/input/${side}/pokemon/basic`,
            shape: [...modelInputShapesMap[`${side}/pokemon/basic`]],
        });
        inputs.push(basicInput);
        const basicFeatures = pokemonBasicLayer.apply(
            basicInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(basicFeatures);

        const speciesInput = tf.layers.input({
            name: `model/input/${side}/pokemon/species`,
            shape: [...modelInputShapesMap[`${side}/pokemon/species`]],
        });
        inputs.push(speciesInput);
        const speciesFeatures = pokemonSpeciesLayer.apply(
            speciesInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(speciesFeatures);

        const typesInput = tf.layers.input({
            name: `model/input/${side}/pokemon/types`,
            shape: [...modelInputShapesMap[`${side}/pokemon/types`]],
        });
        inputs.push(typesInput);
        const typesFeatures = pokemonTypesLayer.apply(
            typesInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(typesFeatures);

        const statsInput = tf.layers.input({
            name: `model/input/${side}/pokemon/stats`,
            shape: [...modelInputShapesMap[`${side}/pokemon/stats`]],
        });
        inputs.push(statsInput);
        const statsFeatures = pokemonStatsLayer.apply(
            statsInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(statsFeatures);

        const abilityInput = tf.layers.input({
            name: `model/input/${side}/pokemon/ability`,
            shape: [...modelInputShapesMap[`${side}/pokemon/ability`]],
        });
        inputs.push(abilityInput);
        const abilityFeatures = pokemonAbilityLayer.apply(
            abilityInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(abilityFeatures);

        const itemInput = tf.layers.input({
            name: `model/input/${side}/pokemon/item`,
            shape: [...modelInputShapesMap[`${side}/pokemon/item`]],
        });
        inputs.push(itemInput);
        const itemFeatures = pokemonItemLayer.apply(
            itemInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(itemFeatures);

        const lastItemInput = tf.layers.input({
            name: `model/input/${side}/pokemon/last_item`,
            shape: [...modelInputShapesMap[`${side}/pokemon/last_item`]],
        });
        inputs.push(lastItemInput);
        const lastItemFeatures = pokemonItemLayer.apply(
            lastItemInput,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(lastItemFeatures);

        const moveInput = tf.layers.input({
            name: `model/input/${side}/pokemon/moves`,
            shape: [...modelInputShapesMap[`${side}/pokemon/moves`]],
        });
        inputs.push(moveInput);
        const moveFeatures = pokemonMoveLayer.apply(
            moveInput,
        ) as tf.SymbolicTensor;
        const movesetAggregate = pokemonMovesetAggregateLayer.apply(
            moveFeatures,
        ) as tf.SymbolicTensor;
        pokemonFeaturesList.push(movesetAggregate);

        //#endregion

        // Afterwards, each of the [null, team_size, x] input features are
        // concatenated into a single [null, team_size, y] tensor.
        const pokemonConcat = pokemonConcatLayer.apply(
            pokemonFeaturesList,
        ) as tf.SymbolicTensor;

        // Save bench data for switch choice evaluation at the output.
        if (side === "us") {
            usPokemonFeatures = pokemonConcat;
        }

        // Here we element-wise average each of the pokemon features so that the
        // resulting [null, z] tensor can be added to the global feature set.
        const teamPokemonAggregate = teamPokemonAggregateLayer.apply(
            pokemonConcat,
        ) as tf.SymbolicTensor;
        globalFeatures.push(teamPokemonAggregate);

        //#endregion
    }

    const globalConcat = tf.layers
        .concatenate({
            name: "model/global/concat",
            axis: -1,
        })
        .apply(globalFeatures) as tf.SymbolicTensor;

    //#endregion

    //#region Outputs.

    //#region Action probabilities.

    const actionFeatures: tf.SymbolicTensor[] = [];

    //#region Move choices.

    // Should never happen.
    if (!usMoveFeatures) {
        throw new Error("No us move features");
    }

    // Consider both the global features as well as the move itself.
    const actionMoveGlobalRepeat = tf.layers
        .repeatVector({
            name: "model/action/move/global/repeat",
            n: Moveset.maxSize,
        })
        .apply(globalConcat) as tf.SymbolicTensor;
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
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
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

    // Should never happen.
    if (!usPokemonFeatures) {
        throw new Error("No us pokemon features");
    }
    // Exclude active mon from usPokemonFeatures.
    const actionSwitchBench = customLayers
        .slice({
            name: "model/action/switch/bench/slice",
            begin: 1,
        })
        .apply(usPokemonFeatures) as tf.SymbolicTensor;

    // Consider both the global features as well as the bench mon itself.
    const actionSwitchGlobalRepeat = tf.layers
        .repeatVector({
            name: "model/action/switch/global/repeat",
            n: Team.maxSize - 1,
        })
        .apply(globalConcat) as tf.SymbolicTensor;
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
            biasInitializer: "heNormal",
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

    const actionConcat = tf.layers
        .concatenate({
            name: "model/action/concat",
            axis: -1,
        })
        .apply(actionFeatures) as tf.SymbolicTensor;
    const actionOutput = tf.layers
        .softmax({
            name: "model/output/action",
            axis: -1,
        })
        .apply(actionConcat) as tf.SymbolicTensor;
    outputs.push(actionOutput);

    //#endregion

    //#region State value.

    const valueOutput = tf.layers
        .dense({
            name: "model/output/value",
            units: 1,
            // Note: Total reward is between [-1, 1], so value function should
            // be bounded by it via tanh activation.
            activation: "tanh",
            kernelInitializer: "heNormal",
            biasInitializer: "heNormal",
        })
        .apply(globalConcat) as tf.SymbolicTensor;
    outputs.push(valueOutput);

    //#endregion

    //#endregion

    const model = tf.model({name: "model", inputs, outputs});
    // Consistency check.
    verifyModel(model);
    return model;
}
