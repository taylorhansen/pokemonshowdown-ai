import { FutureMove, futureMoves } from "../dex/dex";
import { SelfSwitch } from "../dex/dex-util";
import { TempStatus } from "./TempStatus";

/** Temporary status conditions for a certain team. */
export class TeamStatus
{
    /**
     * Whether the team has to switch pokemon and how that switch will be
     * handled.
     */
    public selfSwitch: SelfSwitch = false;

    /** Wish move status, always ends next turn. */
    public readonly wish = new TempStatus("wishing", 2, /*silent*/true);

    /** Turn counters for each type of future move. */
    public readonly futureMoves: {readonly [id in FutureMove]: TempStatus};

    /** Spikes layers. Max 3. */
    public spikes = 0;
    /** Stealth rock layers. Max 1. */
    public stealthRock = 0;
    /** Toxic Spikes layers. Max 2. */
    public toxicSpikes = 0;

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
        this.wish.tick();

        for (const id of Object.keys(this.futureMoves) as FutureMove[])
        {
            this.futureMoves[id].tick();
        }
    }

    // istanbul ignore next: only used for logging
    /**
     * Encodes all team status data into a string
     * @returns The TeamStatus in string form.
     */
    public toString(): string
    {
        return `[${([] as string[]).concat(
                this.selfSwitch ? [`selfSwitch: ${this.selfSwitch}`] : [],
                this.wish.isActive ? [this.wish.toString()] : [],
                Object.entries(this.futureMoves)
                    .filter(([id, counter]) => counter.isActive)
                    .map(([id, counter]) => counter.toString()),
                this.spikes ? [`spikes ${this.spikes}`] : [],
                this.stealthRock ? [`stealth rock ${this.stealthRock}`] : [],
                this.toxicSpikes ? [`toxic spikes ${this.toxicSpikes}`] : [])
            .join(", ")}]`;
    }
}
