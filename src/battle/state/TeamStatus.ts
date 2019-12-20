import { FutureMove, futureMoves } from "../dex/dex";
import { SelfSwitch } from "../dex/dex-util";
import { ItemTempStatus, ReadonlyItemTempStatus } from "./ItemTempStatus";
import { ReadonlyTempStatus, TempStatus } from "./TempStatus";

export interface ReadonlyTeamStatus
{
    /** Turn counters for each type of future move. */
    readonly futureMoves: {readonly [id in FutureMove]: ReadonlyTempStatus};
    /** Healing Wish status. */
    readonly healingWish: boolean;
    /** Light Screen status. */
    readonly lightScreen: ReadonlyItemTempStatus<"lightscreen">;
    /** Lucky Chant status. */
    readonly luckyChant: ReadonlyTempStatus;
    /** Lunar Dance status. */
    readonly lunarDance: boolean;
    /** Reflect status. */
    readonly reflect: ReadonlyItemTempStatus<"reflect">;
    /**
     * Whether the team has to switch pokemon and how that switch will be
     * handled.
     */
    readonly selfSwitch: SelfSwitch;
    /** Spikes layers. Max 3. */
    readonly spikes: number;
    /** Stealth rock layers. Max 1. */
    readonly stealthRock: number;
    /** Tailwind move status. */
    readonly tailwind: ReadonlyTempStatus;
    /** Toxic Spikes layers. Max 2. */
    readonly toxicSpikes: number;
    /** Wish move status, always ends next turn. */
    readonly wish: ReadonlyTempStatus;
}

/** Temporary status conditions for a certain team. */
export class TeamStatus implements ReadonlyTeamStatus
{
    /** @override */
    public readonly futureMoves: {readonly [id in FutureMove]: TempStatus};
    /** @override */
    public healingWish = false;
    /** @override */
    public readonly lightScreen = new ItemTempStatus([5, 8],
        {lightscreen: "lightclay"}, "lightscreen");
    /** @override */
    public readonly luckyChant = new TempStatus("lucky chant", 5);
    /** @override */
    public lunarDance = false;
    /** @override */
    public readonly reflect = new ItemTempStatus([5, 8], {reflect: "lightclay"},
        "reflect");
    /** @override */
    public selfSwitch: SelfSwitch = false;
    /** @override */
    public spikes = 0;
    /** @override */
    public stealthRock = 0;
    /** @override */
    public readonly tailwind = new TempStatus("tailwind", 2);
    /** @override */
    public toxicSpikes = 0;
    /** @override */
    public readonly wish = new TempStatus("wishing", 2, /*silent*/true);

    /** Creates a TeamStatus. */
    constructor()
    {
        const future = {} as {[id in FutureMove]: TempStatus};
        for (const id of Object.keys(futureMoves) as FutureMove[])
        {
            future[id] = new TempStatus(id, 3, /*silent*/true);
        }
        this.futureMoves = future;
    }

    /**
     * Called at the end of the turn, before a Choice has been sent to the
     * server.
     */
    public postTurn(): void
    {
        for (const id of Object.keys(this.futureMoves) as FutureMove[])
        {
            this.futureMoves[id].tick();
        }

        this.lightScreen.tick();
        this.luckyChant.tick();
        this.reflect.tick();
        this.tailwind.tick(); // will end explicitly before the third tick
        this.wish.tick();
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team status data into a string
     * @returns The TeamStatus in string form.
     */
    public toString(): string
    {
        return `[${([] as string[]).concat(
                Object.entries(this.futureMoves)
                    .filter(([id, counter]) => counter.isActive)
                    .map(([id, counter]) => counter.toString()),
                this.healingWish ? ["healing wish"] : [],
                this.lightScreen.isActive ? [this.lightScreen.toString()] : [],
                this.luckyChant.isActive ? [this.luckyChant.toString()] : [],
                this.lunarDance ? ["lunar dance"] : [],
                this.reflect.isActive ? [this.reflect.toString()] : [],
                this.selfSwitch ? [`selfSwitch: ${this.selfSwitch}`] : [],
                this.spikes ? [`spikes ${this.spikes}`] : [],
                this.stealthRock ? [`stealth rock ${this.stealthRock}`] : [],
                this.tailwind.isActive ? [this.tailwind.toString()] : [],
                this.toxicSpikes ? [`toxic spikes ${this.toxicSpikes}`] : [],
                this.wish.isActive ? [this.wish.toString()] : [])
            .join(", ")}]`;
    }
}
