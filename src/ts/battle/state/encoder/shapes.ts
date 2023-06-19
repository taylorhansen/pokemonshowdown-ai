import {Moveset} from "../Moveset";
import {Team} from "../Team";
import * as encoders from "./encoders";

/** Number of sides to the game. */
export const numTeams = 2;

/** Number of pokemon on a team. */
export const numPokemon = Team.maxSize;

/** Number of active pokemon per team. */
export const numActive = 1;

/** Number of moves in a moveset. */
export const numMoves = Moveset.maxSize;

/** Input shapes for the neural network model, without the batch dimension. */
export const modelInputShapes: readonly (readonly number[])[] = [
    [encoders.roomStatusEncoder.size],
    [numTeams, encoders.teamStatusEncoder.size],
    [numTeams, numActive, encoders.volatileStatusEncoder.size],
    [numTeams, numPokemon],
    [numTeams, numPokemon, encoders.basicEncoder.size],
    [numTeams, numPokemon + numActive, encoders.speciesEncoder.size],
    [numTeams, numPokemon + numActive, encoders.typesEncoder.size],
    [numTeams, numPokemon + numActive, encoders.statTableEncoder.size],
    [numTeams, numPokemon + numActive, encoders.abilityEncoder.size],
    [numTeams, numPokemon, 2 /*curr + last item*/, encoders.itemEncoder.size],
    [numTeams, numPokemon + numActive, numMoves, encoders.moveSlotEncoder.size],
];

/** Flattened version of {@link modelInputShapes}. */
export const flattenedInputShapes: readonly number[] = modelInputShapes.map(
    shape => shape.reduce((a, s) => a * s),
);

/** Total size of the input. Derived from {@link modelInputShapes}. */
export const totalInputSize = flattenedInputShapes.reduce((a, b) => a + b);

/**
 * Input names for the model.
 *
 * Maps 1:1 to {@link modelInputShapes}.
 */
export const modelInputNames: readonly string[] = [
    "room_status",
    "team_status",
    "volatile",
    "alive",
    "basic",
    "species",
    "types",
    "stats",
    "ability",
    "item",
    "moves",
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
