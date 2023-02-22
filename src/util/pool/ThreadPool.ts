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
/** Event for when a WorkerPort has encountered an uncaught exception. */
const workerError = Symbol("workerError");

/** Defines events that the ThreadPool implements. */
interface WorkerEvents
    extends ListenerSignature<{[workerFree]: true; [workerError]: true}> {
    /** When a worker is free. */
    readonly [workerFree]: () => void;
    /** When a worker encounters an uncaught exception. */
    readonly [workerError]: (err: Error) => void;
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
     * @param resourceLimits Optional resource constraints for the thread.
     */
    public constructor(
        public readonly numThreads: number,
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
        this.workerEvents.setMaxListeners(this.numThreads);

        for (let i = 0; i < this.numThreads; ++i) {
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
     */
    public async takePort(): Promise<TWorker> {
        if (this.ports.size <= 0) {
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
        if (this.ports.size <= 0) {
            // Pass silently in case we're in an invalid state, since throwing
            // here could overshadow another more important error.
            return;
        }

        if (!this.ports.has(port)) {
            // Errored port has been returned.
            if (this.erroredPorts.has(port)) {
                this.erroredPorts.delete(port);
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
        worker.on("error", err => {
            // Broadcast error for logging if possible.
            this.workerEvents.emit(workerError, err);

            // Remove the errored worker and create a new one to replace it.
            if (!this.freePorts.includes(port)) {
                // Port hasn't been given back to us yet.
                // Cache it in a special place so that #givePort() doesn't throw
                // later if the original caller decides to give it back.
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
