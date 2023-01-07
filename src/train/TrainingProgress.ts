import ProgressBar from "progress";
import {Config} from "../config/types";
import {Logger} from "../util/logging/Logger";
import {
    ModelTrainBatch,
    ModelTrainData,
    ModelTrainEpisode,
    ModelTrainEval,
    ModelTrainEvalDone,
    ModelTrainLearn,
    ModelTrainRollout,
} from "./model/worker";

/** Handles logging and progress bars during the training loop. */
export class TrainingProgress {
    private learnProgress: ProgressBar | undefined;
    private readonly stepPadding = numDigits(this.config.train.episodes);
    private readonly batchPadding = numDigits(this.config.train.learn.updates);
    private readonly lossDigits = 8;
    private readonly learnPadding =
        "Batch / ".length +
        2 * this.batchPadding +
        " loss=-0.".length +
        this.lossDigits +
        2;

    /** Total rollout games played. */
    private numRolloutGames = 0;

    /** Logger object. */
    private readonly logger: Logger;
    /** Logger with episode counter. */
    private episodeLogger: Logger;

    /**
     * Creates a Train object.
     *
     * @param config Training config.
     * @param logger Logger object. Note that logging function is ignored.
     */
    public constructor(private readonly config: Config, logger: Logger) {
        this.logger = logger.withFunc(msg => this.log(msg));
        this.episodeLogger = this.logger.addPrefix(this.episodePrefix(0));
    }

    /** Logging function that guards for progress bars. */
    private log(msg: string): void {
        if (this.learnProgress && !this.learnProgress.complete) {
            if (msg.endsWith("\n")) {
                // Account for extra newline inserted by interrupt.
                msg = msg.slice(0, -1);
            }
            this.learnProgress.interrupt(msg);
        } else {
            Logger.stderr(msg);
        }
    }

    /** Callback for events during the training loop. */
    public callback(data: ModelTrainData<false /*TSerialized*/>): void {
        switch (data.type) {
            case "episode":
                return this.episode(data);
            case "batch":
                return this.batch(data);
            case "learn":
                return this.learn(data);
            case "rollout":
                return this.rollout(data);
            case "eval":
                return this.eval(data);
            case "evalDone":
                return this.evalDone(data);
            default: {
                const unsupported: never = data;
                throw new Error(
                    "Unsupported data type " +
                        `'${(unsupported as {type: string}).type}'`,
                );
            }
        }
    }

    /** Called at the beginning of each training episode. */
    private episode(data: ModelTrainEpisode): void {
        this.episodeLogger = this.logger.addPrefix(
            this.episodePrefix(data.step),
        );
        this.learnProgress = new ProgressBar(
            this.episodeLogger.prefix + "Batch :batch/:total :bar loss=:loss",
            {
                stream: undefined,
                total: this.config.train.learn.updates,
                head: ">",
                clear: true,
                width:
                    (process.stderr.columns || 80) -
                    this.episodeLogger.prefix.length -
                    this.learnPadding,
            },
        );
        this.learnProgress.render({
            batch: "0".padStart(this.batchPadding),
            loss: "n/a",
        });
    }

    /** Called after processing a learning batch. */
    private batch(data: ModelTrainBatch): void {
        this.learnProgress?.tick({
            batch: String(data.step).padStart(this.batchPadding),
            loss: data.loss.toFixed(this.lossDigits),
        });
    }

    /** Called after processing all learning batches for the current episode. */
    private learn(data: ModelTrainLearn): void {
        this.episodeLogger.addPrefix("Learn: ").info(`Loss = ${data.loss}`);
        this.learnProgress?.terminate();
        this.learnProgress = undefined;
    }

    /** Called after each rollout game. */
    private rollout(data: ModelTrainRollout<false /*TSerialized*/>): void {
        // Note that this indicates a game was completed but not necessarily
        // that the collected data has made it into the learning step just yet.
        ++this.numRolloutGames;

        if (data.err) {
            this.logger
                .addPrefix("Rollout: ")
                .error(
                    `Game ${data.id} threw an error: ` +
                        `${data.err.stack ?? data.err.toString()}`,
                );
        }
    }

    /** Called after each evaluation game. */
    private eval(data: ModelTrainEval<false /*TSerialized*/>): void {
        if (data.err) {
            this.logger
                .addPrefix(this.episodePrefix(data.step))
                .error(
                    `Evaluation game ${data.id} threw an error: ` +
                        `${data.err.stack ?? data.err.toString()}`,
                );
        }
        // TODO: Stacked progress for eval opponents along with next learn bar?
    }

    /** Called after all evaluation games for an episode. */
    private evalDone(data: ModelTrainEvalDone): void {
        const logger = this.logger.addPrefix(this.episodePrefix(data.step));
        for (const vs in data.wlt) {
            if (Object.prototype.hasOwnProperty.call(data.wlt, vs)) {
                const wlt = data.wlt[vs];
                logger
                    .addPrefix(`Evaluate(${vs}): `)
                    .info(`${wlt.win}-${wlt.loss}-${wlt.tie}`);
            }
        }
    }

    private episodePrefix(step: number): string {
        return `Episode(${String(step).padStart(this.stepPadding)}/${
            this.config.train.episodes
        }): `;
    }

    /** Prints short summary of completed training session. */
    public done(): void {
        this.learnProgress?.terminate();
        this.learnProgress = undefined;
        this.logger
            .addPrefix("Rollout: ")
            .info(`Total games = ${this.numRolloutGames}`);
    }
}

function numDigits(n: number): number {
    return Math.max(1, Math.ceil(Math.log10(n)));
}
