import {LearnConfig} from "../../../config/types";

/** Arguments for the learning algorithm. */
export interface LearnArgs extends Omit<LearnConfig, "numDecoderThreads"> {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. 1-based. */
    readonly step: number;
    /** Path to the `.tfrecord` files storing the encoded TrainingExamples. */
    readonly examplePaths: readonly string[];
    /** Total number of TrainingExamples for logging. */
    readonly numExamples: number;
    /** Seed for shuffling training examples. */
    readonly seed?: string;
}
