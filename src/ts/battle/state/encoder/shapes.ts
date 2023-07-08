/** @file Utility constants for state encoders. */
import {Moveset} from "../Moveset";
import {Team} from "../Team";

/** Number of sides to the game. */
export const numTeams = 2;

/** Number of pokemon on a team. */
export const numPokemon = Team.maxSize;

/** Number of active pokemon per team. */
export const numActive = 1;

/** Number of moves in a moveset. */
export const numMoves = Moveset.maxSize;

/** Input names for the model. */
export const modelInputNames: readonly string[] = [
    "room_status",
    "team_status",
    "volatile",
    "basic",
    "species",
    "types",
    "stats",
    "ability",
    "item",
    "moves",
];
