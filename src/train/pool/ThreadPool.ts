import { TypedEmitter } from "tiny-typed-emitter";
import { Worker } from "worker_threads";
import { WorkerPort } from "../port/WorkerPort";
import { WorkerProtocol } from "../port/WorkerProtocol";

/**
 * Required methods for {@link ThreadPool}'s `TWorker` type param.
 *
 * Decorator objects that wrap a WorkerPort must expose at least its
 * {@link WorkerPort.close close} method.
 *
 * @template TProtocol Defines all the request types that can be made to the
 * wrapped worker.
 * @template TTypes Protocol message types.
 */
export type WorkerPortLike
<
    TProtocol extends WorkerProtocol<TTypes>, TTypes extends string
>
    = Pick<WorkerPort<TProtocol, TTypes>, "close">;

/** Event for when a WorkerPort is free. */
const workerFree = Symbol("workerFree");
/** Event for when a WorkerPort has encountered an uncaught exception. */
const workerError = Symbol("workerError");

/** Defines events that the ThreadPool implements. */
interface WorkerEvents
{
    /** When a worker is free. */
    [workerFree](): void;
    /** When a worker encounters an uncaught exception. */
    [workerError](err: Error): void;
}

/**
 * Implements a thread pool using `worker_threads`.
 *
 * Intended to be wrapped using different WorkerPort protocols in an abstraction
 * layer to create thread pools for specific use cases.
 *
 * @template TWorker Worker wrapper type.
 * @template TProtocol Protocol that the wrapped Worker implements.
 * @template TTypes Protocol event types.
 */
export class ThreadPool
<
    TWorker extends WorkerPortLike<TProtocol, TTypes>,
    TProtocol extends WorkerProtocol<TTypes>,
    TTypes extends string
>
{
    /** Used for managing worker events. */
    private readonly workerEvents = new TypedEmitter<WorkerEvents>();
    /** Complete worker port pool. */
    private readonly ports = new Set<TWorker>();
    /** Total worker ports available. */
    private readonly freePorts: TWorker[] = [];
    /** Errored worker ports that have yet to be returned. */
    private readonly erroredPorts = new Set<TWorker>();

    /**
     * Creates a ThreadPool.
     *
     * @param numThreads Number of workers to create.
     * @param scriptPath Path to the worker script. The worker script must
     * support the message protocol defined by the provided `TProtocol` generic
     * type using its parent port.
     * @param workerPortCtor Constructor for the WorkerPort.
     * @param workerData Function that generates data for each worker being
     * created. If a worker has to be restarted, the same instance of the
     * generated worker data will be passed back to it.
     */
    constructor(public readonly numThreads: number,
        private readonly scriptPath: string,
        private readonly workerPortCtor: new(worker: Worker) => TWorker,
        workerData?: () => PromiseLike<any> | any)
    {
        if (numThreads <= 0)
        {
            throw new Error("Expected positive numThreads but got " +
                numThreads);
        }

        for (let i = 0; i < this.numThreads; ++i)
        {
            (async () => await workerData?.())()
                .then(data => this.addWorker(data));
        }
    }

    /**
     * Takes a worker port from the pool. After the port is no longer needed,
     * {@link givePort} must be called with the same port.
     */
    public async takePort(): Promise<TWorker>
    {
        // wait until a port is open
        while (this.freePorts.length <= 0)
        {
            await new Promise<void>(res =>
                this.workerEvents.once(workerFree, res));
        }

        return this.freePorts.pop()!;
    }

    /**
     * Returns a worker port allocated from {@link takePort} back to the thread
     * pool.
     */
    public givePort(port: TWorker): void
    {
        if (!this.ports.has(port))
        {
            // errored port has been returned
            if (this.erroredPorts.has(port))
            {
                this.erroredPorts.delete(port);
                return;
            }
            throw new Error("WorkerPort doesn't belong to this ThreadPool");
        }

        this.freePorts.push(port);
        this.workerEvents.emit(workerFree);
    }

    /**
     * Safely closes each port.
     *
     * Note that future calls to {@link takePort} will never resolve after this
     * resolves.
     */
    public async close(): Promise<void>
    {
        const closePromises: Promise<void>[] = [];
        for (let i = 0; i < this.numThreads; ++i)
        {
            closePromises.push((async () =>
            {
                const port = await this.takePort();
                this.ports.delete(port);
                await port.close();
            })());
        }

        await Promise.all(closePromises);
    }

    /**
     * Adds a new worker to the pool.
     *
     * @param workerData Optional data to pass to the worker.
     */
    private addWorker(workerData?: any): void
    {
        const worker = new Worker(this.scriptPath, {workerData});
        const port = new this.workerPortCtor(worker);
        worker.on("error", err =>
        {
            // broadcast error for logging if possible
            this.workerEvents.emit(workerError, err);

            // remove this worker and create a new one to replace it
            if (!this.freePorts.includes(port))
            {
                // port hasn't been returned yet, cache it in a special place so
                //  that #givePort() doesn't throw once it does get returned
                this.ports.delete(port);
                this.erroredPorts.add(port);
            }
            this.addWorker(workerData);
        });

        this.ports.add(port);
        this.freePorts.push(port);
        this.workerEvents.emit(workerFree);
    }
}
