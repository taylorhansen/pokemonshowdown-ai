import { FutureMove, futureMoves } from "../dex/dex";
import { SelfSwitch } from "../dex/dex-util";
import { ItemTempStatus } from "./ItemTempStatus";
import { TempStatus } from "./TempStatus";

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    /** Turn counters for each type of future move. */
    public readonly futureMoves: {readonly [id in FutureMove]: TempStatus};

    /** Light Screen status. */
    public readonly lightScreen = new ItemTempStatus([5, 8],
        {lightscreen: "lightclay"}, "lightscreen");

    /** Reflect status. */
    public readonly reflect = new ItemTempStatus([5, 8], {reflect: "lightclay"},
        "reflect");

    /**
     * Whether the team has to switch pokemon and how that switch will be
     * handled.
     */
    public selfSwitch: SelfSwitch = false;

    /** Spikes layers. Max 3. */
    public spikes = 0;

    /** Stealth rock layers. Max 1. */
    public stealthRock = 0;

    /** Tailwind move status. */
    public readonly tailwind = new TempStatus("tailwind", 2);

    /** Toxic Spikes layers. Max 2. */
    public toxicSpikes = 0;

    /** Wish move status, always ends next turn. */
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
                this.lightScreen.isActive ? [this.lightScreen.toString()] : [],
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
