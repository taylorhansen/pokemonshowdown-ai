import * as os from "os";
import { TypedEmitter } from "tiny-typed-emitter";
import { Worker } from "worker_threads";
import { WorkerPort } from "./WorkerPort";
import { WorkerRequestMap } from "./WorkerRequest";

interface ThreadPoolEvents
{
    [ThreadPool.workerFreedEvent]: () => void;
    [ThreadPool.workerErrorEvent]: (err: Error) => void;
}

/** Uses `worker_threads` to implement a thread pool. */
export abstract class ThreadPool<TWorker extends WorkerPort<TMap>,
        TMap extends WorkerRequestMap<string>> extends
    TypedEmitter<ThreadPoolEvents>
{
    /** Event for when a WorkerPort is free. */
    public static readonly workerFreedEvent = Symbol("workerFreedEvent");
    /** Event for when a WorkerPort has thrown an error. */
    public static readonly workerErrorEvent = Symbol("workerErrorEvent");

    /** Complete worker port pool. */
    private readonly ports = new Set<TWorker>();
    /** Total worker ports available. */
    private readonly freePorts: TWorker[] = [];
    /** Errored worker ports that have yet to be returned. */
    private readonly erroredPorts = new Set<TWorker>();

    /**
     * Creates a ThreadPool.
     * @param scriptPath Path to the worker script. The worker script must
     * support message protocols derived from the provided `TMap` generic type
     * and the WorkerCloseProtocol.
     * @param workerPortConstructor Constructor for the WorkerPort.
     * @param workerData Function that generates unique data for each worker
     * being created. If a worker has to be restarted, the same instance of the
     * generated worker data will be passed back to it.
     * @param numThreads Number of workers to create. Defaults to the number of
     * CPUs on the current system.
     */
    constructor(private readonly scriptPath: string,
        private readonly workerPortConstructor: new(worker: Worker) => TWorker,
        workerData?: () => Promise<any> | any,
        public readonly numThreads = os.cpus().length)
    {
        super();

        if (numThreads <= 0)
        {
            throw new Error("Expected positive numThreads but got " +
                numThreads);
        }

        this.initWorkers(workerData);
    }

    /**
     * Takes a worker port from the pool. After the port has been used,
     * `#givePort()` must be called with the same port.
     */
    public async takePort(): Promise<TWorker>
    {
        // wait until a port is open
        while (this.freePorts.length <= 0)
        {
            await new Promise(res =>
                this.once(ThreadPool.workerFreedEvent, res));
        }

        return this.freePorts.pop()!;
    }

    /** Returns a worker port to the pool. */
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
        this.emit(ThreadPool.workerFreedEvent);
    }

    /**
     * Safely closes each port. Future calls to `#takePort()` will never resolve
     * after this resolves.
     */
    public async close(): Promise<void>
    {
        const closePromises: Promise<void>[] = [];
        for (let i = 0; i < this.numThreads; ++i)
        {
            closePromises.push(this.takePort()
                .then(async port =>
                {
                    this.ports.delete(port);
                    await port.close();
                }));
        }

        await Promise.all(closePromises);
    }

    /** Initializes all workers. */
    private async initWorkers(workerData?: () => Promise<any> | any):
        Promise<void>
    {
        const promises: Promise<void>[] = [];
        const f = async () => this.addWorker(await workerData?.());
        for (let i = 0; i < this.numThreads; ++i) promises.push(f());
        await Promise.all(promises);
    }

    /**
     * Adds a new worker to the pool.
     * @param workerData Optional worker data.
     */
    private addWorker(workerData?: any): void
    {
        const worker = new Worker(this.scriptPath, {workerData});
        const port = new this.workerPortConstructor(worker);
        worker.on("error", err =>
        {
            // broadcast error for logging if possible
            this.emit(ThreadPool.workerErrorEvent, err);

            // remove this worker and create a new one to replace it
            this.ports.delete(port);
            this.erroredPorts.add(port);
            port.worker.terminate();
            this.addWorker(workerData);
        });

        this.ports.add(port);
        this.freePorts.push(port);
        this.emit(ThreadPool.workerFreedEvent);
    }
}
