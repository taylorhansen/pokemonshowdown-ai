import { Experience } from "./Experience";

/**
 * Stores Experience objects in a circular queue, discarding the oldest once
 * full.
 */
export class Memory
{
    /** Current size of the queue. */
    public get size(): number { return this.currentSize; }
    /** Holds all the Experience objects. */
    private readonly buffer: Experience[];
    /** Number of elements that have been queued. Stops counting when full. */
    private currentSize = 0;
    /**
     * Next index to queue items to. Rolls over once full to start replacing the
     * oldest elements.
     */
    private nextIndex = 0;

    /**
     * Creates a Memory buffer.
     * @param size Maximum size before adding more Experiences discards the
     * oldest one.
     */
    constructor(size: number)
    {
        this.buffer = new Array(size);
    }

    /** Adds an Experience object to the buffer. */
    public add(exp: Experience): void
    {
        this.buffer[this.nextIndex++] = exp;
        if (this.nextIndex >= this.buffer.length)
        {
            // roll over to the beginning
            // subsequent #add()'s will start to replace old elements
            this.nextIndex = 0;
        }
        else if (this.currentSize < this.buffer.length) ++this.currentSize;
    }

    /** Takes `n` random Experiences from the buffer. */
    public sample(n: number): Experience[]
    {
        if (n > this.currentSize)
        {
            throw new RangeError("Sampling more elements than available");
        }

        // there are other faster reservoir sampling algorithms/libraries but
        //  this works fine for now
        // this is equivalent to truncating the result of a fisher-yates
        //  shuffle, except the order isn't uniformly random

        // start with the first n elements in the buffer
        const result = this.buffer.slice(0, n);
        // go through the rest of buffer
        for (let i = n; i < this.currentSize; ++i)
        {
            // get a random index from 0 to i inclusive
            const j = Math.floor(Math.random() * (i + 1));
            // if the random index is smaller than k, replace the current
            //  element with a new one from the buffer
            if (j < n) result[j] = this.buffer[i];
        }
        return result;
    }
}
