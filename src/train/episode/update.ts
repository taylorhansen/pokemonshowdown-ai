import ProgressBar from "progress";
import {LearnConfig} from "../../config/types";
import {Logger} from "../../util/logging/Logger";
import {Seeder} from "../../util/random";
import {ModelWorker} from "../model/worker";

/** Args for {@link update}. */
export interface UpdateArgs {
    /** Name of the current training run, under which to store logs. */
    readonly name: string;
    /** Current episode iteration of the training run. */
    readonly step: number;
    /** Used to request the model update. */
    readonly models: ModelWorker;
    /** Name of the model to train. */
    readonly model: string;
    /** Number of examples to train over. */
    readonly numExamples: number;
    /** Paths to the training example files. */
    readonly examplePaths: string[];
    /** Configuration for the learning process. */
    readonly learnConfig: LearnConfig;
    /** Logger object. */
    readonly logger: Logger;
    /** Random seed generators. */
    readonly seeders?: UpdateSeeders;
    /** Whether to show progress bars. */
    readonly progress?: boolean;
}

/** Random seed generators used by the learning algorithm. */
export interface UpdateSeeders {
    /**
     * Random seed generator for learning algorithm's training example shuffler.
     */
    readonly learn?: Seeder;
}

/**
 * Runs the update phase of the training script, updating the model with the
 * experience collected during the rollout phase.
 *
 * @returns The training loss of the model after the update, or `undefined` if
 * an error was encountered.
 */
export async function update({
    name,
    step,
    models,
    model,
    numExamples,
    examplePaths,
    learnConfig,
    logger,
    seeders,
    progress,
}: UpdateArgs): Promise<number | undefined> {
    logger.info("Training over experience");

    if (numExamples <= 0) {
        logger.error("No experience to train over");
        return;
    }

    let finalLoss: number | undefined;
    let progressBar: ProgressBar | undefined;
    let numBatches: number | undefined;
    let batchPadding: number | undefined;
    function startProgress() {
        if (!numBatches) {
            throw new Error("numBatches not initialized");
        }
        const prefixWidth =
            logger.prefix.length +
            "Batch /: ".length +
            2 * Math.max(1, Math.ceil(Math.log10(numBatches)));
        const postFixWidth = " loss=-0.00000000".length;
        const padding = 2;
        const barWidth =
            (process.stderr.columns || 80) -
            prefixWidth -
            postFixWidth -
            padding;
        progressBar = new ProgressBar(
            `${logger.prefix}Batch :batch/:total: :bar loss=:loss`,
            {
                total: numBatches,
                head: ">",
                clear: true,
                width: barWidth,
            },
        );
        progressBar.render({
            batch: "0".padStart(
                (batchPadding = Math.max(1, Math.ceil(Math.log10(numBatches)))),
            ),
            loss: "n/a",
        });
    }
    await models.learn(
        model,
        {
            ...learnConfig,
            name,
            step,
            examplePaths,
            numExamples,
            ...(seeders?.learn && {seed: seeders.learn()}),
        },
        function onStep(data) {
            switch (data.type) {
                case "start":
                    if (progress) {
                        ({numBatches} = data);
                        startProgress();
                    }
                    break;
                case "epoch":
                    finalLoss = data.loss;

                    // Ending summary statement for the current epoch.
                    progressBar?.terminate();
                    logger
                        .addPrefix(
                            `Epoch(${String(data.epoch).padStart(
                                Math.max(
                                    1,
                                    Math.ceil(Math.log10(learnConfig.epochs)),
                                ),
                            )}/${learnConfig.epochs}): `,
                        )
                        .info(`Loss = ${data.loss}`);

                    // Restart progress bar for the next epoch.
                    if (data.epoch < learnConfig.epochs) {
                        startProgress();
                    }
                    break;
                case "batch":
                    progressBar?.tick({
                        batch: String(data.batch + 1).padStart(batchPadding!),
                        loss: data.loss.toFixed(8),
                    });
                    break;
            }
        },
    );
    progressBar?.terminate();

    return finalLoss;
}
