/**
 * @file Specifies the input/output shapes of the model. Safe to import in
 * non-tf threads.
 */
import {intToChoice} from "../psbot/handlers/battle/agent";
import * as encoders from "../psbot/handlers/battle/ai/encoder/encoders";
import {Moveset} from "../psbot/handlers/battle/state/Moveset";
import {Team} from "../psbot/handlers/battle/state/Team";

/** Number of sides to the game. */
export const numTeams = 2;

/** Number of pokemon on a team. */
export const teamSize = Team.maxSize;

/** Number of moves in a moveset. */
export const numMoves = Moveset.maxSize;

/** Input shapes for the neural network model, without the batch dimension. */
export const modelInputShapes: readonly (readonly number[])[] = [
    // Room.
    [encoders.roomStatusEncoder.size],
    // Team status.
    [numTeams, encoders.teamStatusEncoder.size],
    // Active traits/statuses.
    [numTeams, encoders.volatileStatusEncoder.size],
    [numTeams, encoders.definedSpeciesEncoder.size],
    [numTeams, encoders.definedTypesEncoder.size],
    [numTeams, encoders.definedStatTableEncoder.size],
    [numTeams, encoders.definedAbilityEncoder.size],
    [numTeams, Moveset.maxSize, encoders.moveSlotEncoder.size],
    // Bench traits/statuses.
    [numTeams, teamSize],
    [numTeams, teamSize, encoders.basicEncoder.size],
    [numTeams, teamSize, encoders.speciesEncoder.size],
    [numTeams, teamSize, encoders.typesEncoder.size],
    [numTeams, teamSize, encoders.statTableEncoder.size],
    [numTeams, teamSize, encoders.abilityEncoder.size],
    [numTeams, teamSize, encoders.itemEncoder.size],
    [numTeams, teamSize, encoders.lastItemEncoder.size],
    [numTeams, teamSize, numMoves, encoders.moveSlotEncoder.size],
];

/** Flattened version of {@link modelInputShapes}. */
export const flattenedInputShapes: readonly number[] = modelInputShapes.map(
    shape => shape.reduce((a, s) => a * s, 1),
);

/**
 * Input names for the {@link createModel model}.
 *
 * Same length as {@link modelInputShapes}.
 */
export const modelInputNames: readonly string[] = [
    "room",
    "team/status",
    "team/active/volatile",
    "team/active/species",
    "team/active/types",
    "team/active/stats",
    "team/active/ability",
    "team/active/moves",
    "team/pokemon/alive",
    "team/pokemon/basic",
    "team/pokemon/species",
    "team/pokemon/types",
    "team/pokemon/stats",
    "team/pokemon/ability",
    "team/pokemon/item",
    "team/pokemon/last_item",
    "team/pokemon/moves",
];

/**
 * Maps input names from {@link modelInputNames} to their corresponding shapes
 * as specified in {@link modelInputShapes}.
 */
export const modelInputShapesMap: {
    readonly [name: string]: readonly number[];
} = Object.fromEntries(
    modelInputNames.map((name, i) => [name, modelInputShapes[i]]),
);

/**
 * Output shape for the {@link createModel model}, without the batch dimension.
 */
export const modelOutputShape = [intToChoice.length];

/** Output name for the {@link createModel model}. */
export const modelOutputName = "action";
