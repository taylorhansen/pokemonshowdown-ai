/** Temporary status conditions in the entire battle room. */
export class RoomStatus
{
    // TODO
}

/** Team state. */
export class Team
{
    /** Team-related status conditions. */
    private status: TeamStatus;
    /** The pokemon that compose this team. First one is always active. */
    private pokemon: Pokemon[];
}

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    // TODO
}

/** Holds all the possibly incomplete info about a pokemon. */
export class Pokemon
{
    /** Pokemon species. */
    private species: number;
    /** Item the pokemon is holding. */
    private item: number;
    /**
     * Base ability relative to its species. Can be 0 or 1 indicating which
     * ability that is.
     */
    private baseAbility: number;
    /** Pokemon's level from 1 to 100. */
    private readonly level: number;
    /** Known moveset. */
    private readonly moves: Move[];
    /** Info about the pokemon's hit points. */
    private readonly hp: HP;
    /** Current major status condition, not cleared on switch. */
    private status?: MajorStatusName; // TODO
    /** Minor status conditions, cleared on switch. */
    private readonly volatileStatus: VolatileStatus;
}

/** Information about a certain move. */
export class Move
{
    /** Amount of power points left on this move. */
    public get ppLeft(): number
    {
        return this.ppMax - this.pp;
    }

    /** Current power points. */
    private pp: number;
    /** Maximum amount of power points. */
    private readonly ppMax: number;
    /** Move id. */
    private readonly id: number;
}

/** Hit points info. */
export class HP
{
    /** Current HP. */
    private current: number;
    /** Maximum HP. */
    private readonly max: number;
    /**
     * Whether this is represented as a percentage. If true, `max` is `100` and
     * `current` is the percentage.
     */
    private readonly percent: boolean;
}

/** Major pokemon status conditions. */
export type MajorStatusName = "brn" | "par" | "psn" | "tox" | "slp" | "frz";

/** Minor or temporary status conditions that are removed upon switch. */
export class VolatileStatus
{
    /** Stat boost stages. Min -6, max 6. */
    private statBoosts: {[N in BoostableStatName]: number};
    // TODO
}

/** Names of pokemon stats that can be boosted. */
export type BoostableStatName = "atk" | "def" | "spa" | "spd" | "spe" |
    "accuracy" | "evasion";

/** Identifies a team's side in the client's perspective. */
export type Side = "us" | "them";

/**
 * Holds all the data about a battle. This is used as input to the nerual
 * network.
 */
export class BattleState
{
    /** Global status conditions for the entire room. */
    private status = new RoomStatus();
    /** Team data. */
    private teams: {readonly [S in Side]: Team} =
        { "us": new Team(), "them": new Team() };
}
