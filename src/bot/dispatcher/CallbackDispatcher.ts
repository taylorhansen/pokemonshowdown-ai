// TODO: remove boilerplate between BattleEventListener/AnyMessageListener

export class CallbackDispatcher<Args extends any[]>
{
    private readonly callbacks: Callback<Args>[] = [];

    public async dispatch(...args: Args): Promise<void>
    {
        await Promise.all(this.callbacks.map(callback => callback(...args)));
    }

    public addCallback(callback: Callback<Args>): void
    {
        this.callbacks.push(callback);
    }
}

export type Callback<Args extends any[]> =
    (...args: Args) => void | Promise<void>;
