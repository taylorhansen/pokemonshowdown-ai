import { AnyBattleEvent, BattleEvent, BattleEventType } from "./BattleEvent";
import { Callback, CallbackDispatcher } from "./CallbackDispatcher";

type BattleEventDispatcher<T extends BattleEventType> =
    CallbackDispatcher<BattleEventArgs<T>>;

export class BattleEventListener
{
    private readonly dispatchers: {readonly [T in BattleEventType]:
            BattleEventDispatcher<T>} =
    {
        ability: new CallbackDispatcher<any[]>(),
        activate: new CallbackDispatcher<BattleEventArgs<"activate">>(),
        boost: new CallbackDispatcher<BattleEventArgs<"boost">>(),
        cant: new CallbackDispatcher<BattleEventArgs<"cant">>(),
        curestatus: new CallbackDispatcher<BattleEventArgs<"curestatus">>(),
        cureteam: new CallbackDispatcher<BattleEventArgs<"cureteam">>(),
        damage: new CallbackDispatcher<BattleEventArgs<"damage">>(),
        end: new CallbackDispatcher<BattleEventArgs<"end">>(),
        faint: new CallbackDispatcher<BattleEventArgs<"faint">>(),
        move: new CallbackDispatcher<BattleEventArgs<"move">>(),
        mustrecharge: new CallbackDispatcher<BattleEventArgs<"mustrecharge">>(),
        prepare: new CallbackDispatcher<BattleEventArgs<"prepare">>(),
        sethp: new CallbackDispatcher<BattleEventArgs<"sethp">>(),
        singleturn: new CallbackDispatcher<BattleEventArgs<"singleturn">>(),
        start: new CallbackDispatcher<BattleEventArgs<"start">>(),
        status: new CallbackDispatcher<BattleEventArgs<"status">>(),
        switch: new CallbackDispatcher<BattleEventArgs<"switch">>(),
        tie: new CallbackDispatcher<BattleEventArgs<"tie">>(),
        turn: new CallbackDispatcher<BattleEventArgs<"turn">>(),
        upkeep: new CallbackDispatcher<BattleEventArgs<"upkeep">>(),
        win: new CallbackDispatcher<BattleEventArgs<"win">>()
    };

    public on<T extends BattleEventType>(type: T,
        callback: Callback<BattleEventArgs<T>>): this
    {
        (this.dispatchers[type] as BattleEventDispatcher<T>)
            .addCallback(callback);
        return this;
    }

    public dispatch<T extends BattleEventType>(type: T,
        ...args: BattleEventArgs<T>): Promise<void>
    {
        return (this.dispatchers[type] as BattleEventDispatcher<T>)
            .dispatch(...args);
    }
}

export type BattleEventArgs<T extends BattleEventType> =
    [BattleEvent<T>, AnyBattleEvent[], number];
