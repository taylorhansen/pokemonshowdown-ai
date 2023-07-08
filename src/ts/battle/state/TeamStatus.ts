import {FutureMove, futureMoveKeys, SelfSwitchType} from "../dex";
import {ReadonlyTempStatus, TempStatus} from "./TempStatus";

/** Readonly {@link TeamStatus} representation. */
export interface ReadonlyTeamStatus {
    /** Turn counters for each type of future move. */
    readonly futureMoves: {readonly [id in FutureMove]: ReadonlyTempStatus};
    /** Healing Wish status. */
    readonly healingwish: boolean;
    /** Light Screen status. */
    readonly lightscreen: ReadonlyTempStatus;
    /** Lucky Chant status. */
    readonly luckychant: ReadonlyTempStatus;
    /** Lunar Dance status. */
    readonly lunardance: boolean;
    /** Mist status. */
    readonly mist: ReadonlyTempStatus;
    /** Reflect status. */
    readonly reflect: ReadonlyTempStatus;
    /** Safeguard status. */
    readonly safeguard: ReadonlyTempStatus;
    /**
     * Whether the team has to switch pokemon and how that switch will be
     * handled.
     */
    readonly selfSwitch: SelfSwitchType | null;
    /** Spikes layers. Max 3. */
    readonly spikes: number;
    /** Stealth rock layers. Max 1. */
    readonly stealthrock: number;
    /** Tailwind move status. */
    readonly tailwind: ReadonlyTempStatus;
    /** Toxic Spikes layers. Max 2. */
    readonly toxicspikes: number;
    /** Wish move status, always ends next turn. */
    readonly wish: ReadonlyTempStatus;

    /** Encodes all team status data into a string. */
    readonly toString: () => string;
}

/** Temporary status conditions for a certain team. */
export class TeamStatus implements ReadonlyTeamStatus {
    /** @override */
    public readonly futureMoves: {readonly [id in FutureMove]: TempStatus} =
        (function () {
            const future = {} as {[id in FutureMove]: TempStatus};
            for (const id of futureMoveKeys) {
                // 3 turns, end on last (can be silent).
                future[id] = new TempStatus(id, 3, true /*silent*/);
            }
            return future;
        })();
    /** @override */
    public healingwish = false;
    // 5-8 turns, end on last.
    /** @override */
    public readonly lightscreen = new TempStatus("lightscreen", 8);
    /** @override */
    public readonly luckychant = new TempStatus("luckychant", 5);
    /** @override */
    public lunardance = false;
    /** @override */
    public readonly mist = new TempStatus("mist", 5);
    // 5-8 turns, end on last.
    /** @override */
    public readonly reflect = new TempStatus("reflect", 8);
    // 5 turns, end on last.
    /** @override */
    public readonly safeguard = new TempStatus("safeguard", 5);
    /** @override */
    public selfSwitch: SelfSwitchType | null = null;
    /** @override */
    public spikes = 0;
    /** @override */
    public stealthrock = 0;
    /** @override */
    public readonly tailwind = new TempStatus("tailwind", 3);
    /** @override */
    public toxicspikes = 0;
    // Ends next turn (can be silent).
    /** @override */
    public readonly wish = new TempStatus("wishing", 2, true /*silent*/);

    /**
     * Called at the end of the turn, before a Choice has been sent to the
     * server.
     */
    public postTurn(): void {
        for (const id of futureMoveKeys) {
            this.futureMoves[id].tick();
        }
        this.lightscreen.tick();
        this.luckychant.tick();
        this.mist.tick();
        this.reflect.tick();
        this.safeguard.tick();
        this.tailwind.tick();
        this.wish.tick();
    }

    // istanbul ignore next: Only used for logging.
    /** @override */
    public toString(): string {
        return `[${([] as string[])
            .concat(
                Object.entries(this.futureMoves)
                    .filter(([, counter]) => counter.isActive)
                    .map(([, counter]) => counter.toString()),
                this.healingwish ? ["healing wish"] : [],
                this.lightscreen.isActive ? [this.lightscreen.toString()] : [],
                this.luckychant.isActive ? [this.luckychant.toString()] : [],
                this.lunardance ? ["lunar dance"] : [],
                this.mist.isActive ? [this.mist.toString()] : [],
                this.reflect.isActive ? [this.reflect.toString()] : [],
                this.safeguard.isActive ? [this.safeguard.toString()] : [],
                this.selfSwitch ? [`selfSwitch: ${this.selfSwitch}`] : [],
                this.spikes ? [`spikes ${this.spikes}`] : [],
                this.stealthrock ? [`stealth rock ${this.stealthrock}`] : [],
                this.tailwind.isActive ? [this.tailwind.toString()] : [],
                this.toxicspikes ? [`toxic spikes ${this.toxicspikes}`] : [],
                this.wish.isActive ? [this.wish.toString()] : [],
            )
            .join(", ")}]`;
    }
}
