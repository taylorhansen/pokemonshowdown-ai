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

/** Number of active pokemon per team. */
export const numActive = 1;

/** Number of moves in a moveset. */
export const numMoves = Moveset.maxSize;

/** Input shapes for the neural network model, without the batch dimension. */
export const modelInputShapes: readonly (readonly number[])[] = [
    [encoders.roomStatusEncoder.size],
    [numTeams, encoders.teamStatusEncoder.size],
    [numTeams, numActive, encoders.volatileStatusEncoder.size],
    [numTeams, teamSize],
    [numTeams, teamSize, encoders.basicEncoder.size],
    [numTeams, teamSize + numActive, encoders.speciesEncoder.size],
    [numTeams, teamSize + numActive, encoders.typesEncoder.size],
    [numTeams, teamSize + numActive, encoders.statTableEncoder.size],
    [numTeams, teamSize + numActive, encoders.abilityEncoder.size],
    [numTeams, teamSize, encoders.itemEncoder.size],
    [numTeams, teamSize, encoders.lastItemEncoder.size],
    [numTeams, teamSize + numActive, numMoves, encoders.moveSlotEncoder.size],
];

/** Flattened version of {@link modelInputShapes}. */
export const flattenedInputShapes: readonly number[] = modelInputShapes.map(
    shape => shape.reduce((a, s) => a * s, 1),
);

/**
 * Input names for the model.
 *
 * Maps 1:1 to {@link modelInputShapes}.
 */
export const modelInputNames: readonly string[] = [
    "room/status",
    "team/status",
    "active/volatile",
    "pokemon/alive",
    "pokemon/basic",
    "pokemon/species",
    "pokemon/types",
    "pokemon/stats",
    "pokemon/ability",
    "pokemon/item",
    "pokemon/last_item",
    "pokemon/moves",
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

/** Output shape for the model, without the batch dimension. */
export const modelOutputShape = [intToChoice.length];

/** Output name for the model. */
export const modelOutputName = "action";
