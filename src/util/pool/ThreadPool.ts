import {ResourceLimits, Worker} from "worker_threads";
import {ListenerSignature, TypedEmitter} from "tiny-typed-emitter";
import {WorkerPort} from "../worker/WorkerPort";
import {WorkerProtocol} from "../worker/WorkerProtocol";

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
export type WorkerPortLike<
    TProtocol extends WorkerProtocol<TTypes>,
    TTypes extends string,
> = Pick<WorkerPort<TProtocol, TTypes>, "close" | "terminate">;

/** Event for when a WorkerPort is free. */
const workerFree = Symbol("workerFree");

/** Defines events that the ThreadPool implements. */
interface WorkerEvents extends ListenerSignature<{[workerFree]: true}> {
    /** When a worker is free. */
    readonly [workerFree]: () => void;
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
 * @template TWorkerData Data to pass to the worker as it gets created.
 */
export class ThreadPool<
    TWorker extends WorkerPortLike<TProtocol, TTypes>,
    TProtocol extends WorkerProtocol<TTypes>,
    TTypes extends string,
    TWorkerData = unknown,
> {
    /** Whether the thread pool has been {@link close closed}. */
    public get isClosed(): boolean {
        return this.ports.size <= 0;
    }

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
     * @param numThreads Number of worker threads to create.
     * @param threadParallel Number of concurrent requests per worker thread.
     * @param scriptPath Path to the worker script. The worker script must
     * support the message protocol defined by the provided `TProtocol` generic
     * type using its parent port.
     * @param workerPortCtor Constructor for the WorkerPort.
     * @param workerData Function that generates data for each worker being
     * created. If a worker has to be restarted, the same instance of the
     * generated worker data will be passed back to it.
     * @param resourceLimits Optional resource constraints for the thread.
     */
    public constructor(
        public readonly numThreads: number,
        public readonly threadParallel: number,
        private readonly scriptPath: string,
        private readonly workerPortCtor: new (worker: Worker) => TWorker,
        workerData: (i: number) => TWorkerData,
        resourceLimits?: ResourceLimits,
    ) {
        if (numThreads <= 0) {
            throw new Error(
                `Expected positive numThreads but got ${numThreads}`,
            );
        }
        this.workerEvents.setMaxListeners(numThreads * threadParallel);

        for (let i = 0; i < numThreads; ++i) {
            this.addWorker(workerData?.(i), resourceLimits);
        }
    }

    /**
     * Takes a worker port from the pool.
     *
     * After the port is no longer needed, {@link givePort} must be called with
     * the same port.
     *
     * Heavy usage can cause listeners to build up, so try to limit the number
     * of outstanding calls to this method by the {@link numThreads}.
     *
     * Also, having a {@link threadParallel} > 1 will allow for the same port to
     * be reserved multiple times.
     */
    public async takePort(): Promise<TWorker> {
        if (this.isClosed) {
            throw new Error("ThreadPool is closed");
        }

        // Wait until a port is open.
        while (this.freePorts.length <= 0) {
            await new Promise<void>(res =>
                this.workerEvents.once(workerFree, res),
            );
        }

        return this.freePorts.pop()!;
    }

    /**
     * Returns a worker port allocated from {@link takePort} back to the thread
     * pool.
     */
    public givePort(port: TWorker): void {
        if (this.isClosed) {
            // Pass silently in case we're in an invalid state, since throwing
            // here could overshadow another more important error.
            return;
        }

        if (!this.ports.has(port)) {
            // Errored port has been returned.
            if (this.erroredPorts.has(port)) {
                return;
            }
            throw new Error("WorkerPort doesn't belong to this ThreadPool");
        }

        this.freePorts.push(port);
        this.workerEvents.emit(workerFree);
    }

    /**
     * Safely closes each port by calling {@link takePort}.
     *
     * Note that future calls to {@link takePort} will never resolve after this
     * resolves.
     */
    public async close(): Promise<void> {
        const closePromises: Promise<void>[] = [];
        for (let i = 0; i < this.numThreads; ++i) {
            closePromises.push(
                (async () => {
                    const port = await this.takePort();
                    this.ports.delete(port);
                    await port.close();
                })(),
            );
        }

        await Promise.all(closePromises);
    }

    /** Applies a function onto each worker. Bypasses {@link takePort} lock. */
    public async map<T>(f: (port: TWorker) => Promise<T>): Promise<T[]> {
        return await Promise.all(this.mapAsync(f));
    }

    /**
     * Applies a function onto each worker without sync step. Bypasses
     * {@link takePort} lock.
     */
    public mapAsync<T>(f: (port: TWorker) => Promise<T>): Promise<T>[] {
        const promises: Promise<T>[] = [];
        for (const port of this.ports) {
            promises.push(f(port));
        }
        return promises;
    }

    /**
     * Closes each of the threads that are currently running.
     *
     * Future calls to {@link takePort} will throw after this method is called.
     */
    public async terminate(): Promise<void> {
        this.freePorts.length = 0;
        const closePromises: Promise<void>[] = [];
        for (const port of this.ports) {
            closePromises.push(port.terminate());
            this.ports.delete(port);
        }
        for (const port of this.erroredPorts) {
            closePromises.push(port.terminate());
            this.erroredPorts.delete(port);
        }
        await Promise.all(closePromises);
    }

    /**
     * Adds a new worker to the pool.
     *
     * @param workerData Optional data to pass to the worker.
     * @param resourceLimits Optional resource constraints for the thread.
     */
    private addWorker(
        workerData: TWorkerData,
        resourceLimits?: ResourceLimits,
    ): void {
        const worker = new Worker(this.scriptPath, {
            workerData,
            ...(resourceLimits && {resourceLimits}),
        });
        const port = new this.workerPortCtor(worker);
        worker.on("error", () => {
            // Note: The constructor-provided WorkerPort class should be able to
            // handle any dangling requests as a result of the error.

            // Store port in a special place so that givePort() doesn't throw.
            this.erroredPorts.add(port);

            // Replace crashed worker with a new one.
            this.removeWorker(port);
            this.addWorker(workerData);
        });
        worker.on("exit", () => this.removeWorker(port));

        this.ports.add(port);
        for (let i = 0; i < this.threadParallel; ++i) {
            this.givePort(port);
        }
    }

    /** Removes worker from the pool. */
    private removeWorker(port: TWorker): void {
        if (!this.ports.delete(port)) {
            return;
        }
        for (let i = 0; i < this.freePorts.length; ++i) {
            if (port === this.freePorts[i]) {
                this.freePorts.splice(i--, 1);
            }
        }
    }
}
