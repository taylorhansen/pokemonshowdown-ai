import ProgressBar from "progress";
import {TrainConfig} from "../config/types";
import {
    ModelTrainData,
    ModelTrainEval,
    ModelTrainEvalDone,
    ModelTrainRollout,
    ModelTrainStep,
} from "../model/worker";
import {estimateEta} from "../util/eta";
import {formatUptime, numDigits} from "../util/format";
import {Logger} from "../util/logging/Logger";

/** Handles logging and progress bars during the training loop. */
export class TrainingProgress {
    private progress: ProgressBar | undefined;
    private readonly stepPadding = this.config.steps
        ? numDigits(this.config.steps)
        : 0;
    private static readonly lossDigits = 8;
    private readonly progressPadding =
        "Step / ".length +
        2 * this.stepPadding +
        (this.config.learn.reportInterval
            ? " loss=0.".length + TrainingProgress.lossDigits
            : 0) +
        " eta=00d00h00m00s".length +
        1;
    private startTime: number | undefined;
    private lastLoss = (0).toFixed(TrainingProgress.lossDigits);

    /** Total rollout games played. */
    private numRolloutGames = 0;

    /** Logger object. */
    private readonly logger: Logger;

    /**
     * Creates a Train object.
     *
     * @param config Training config.
     * @param logger Logger object. Note that logging function is ignored.
     */
    public constructor(private readonly config: TrainConfig, logger: Logger) {
        this.logger = logger.withFunc(msg => this.log(msg));

        if (this.config.progress && this.config.steps) {
            this.progress = new ProgressBar(
                this.logger.prefix +
                    `Step :step/:total :bar${
                        this.config.learn.reportInterval ? " loss=:loss" : ""
                    } eta=:est`,
                {
                    total: this.config.steps,
                    head: ">",
                    clear: true,
                    width:
                        (process.stderr.columns || 80) -
                        this.logger.prefix.length -
                        this.progressPadding,
                },
            );
            this.progress.render({
                step: "0".padStart(this.stepPadding),
                loss: this.lastLoss,
                est: "0s",
            });
        }
    }

    /** Logging function that guards for progress bars. */
    private log(msg: string): void {
        if (this.progress && !this.progress.complete) {
            if (msg.endsWith("\n")) {
                // Account for extra newline inserted by interrupt.
                msg = msg.slice(0, -1);
            }
            this.progress.interrupt(msg);
        } else {
            Logger.stderr(msg);
        }
    }

    /** Callback for events during the training loop. */
    public callback(data: ModelTrainData<false /*TSerialized*/>): void {
        switch (data.type) {
            case "step":
                return this.step(data);
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

    /** Called after each training step. */
    private step(data: ModelTrainStep): void {
        if (this.progress) {
            let est: string;
            if (this.startTime === undefined) {
                this.startTime = process.uptime();
                est = "n/a";
            } else {
                est = formatUptime(
                    estimateEta(
                        this.startTime,
                        process.uptime(),
                        this.progress.curr + 1,
                        this.progress.total,
                    ),
                );
            }
            if (data.loss !== undefined) {
                this.lastLoss = data.loss.toFixed(TrainingProgress.lossDigits);
            }
            this.progress.tick({
                step: String(data.step).padStart(this.stepPadding),
                loss: this.lastLoss,
                est,
            });
        } else if (
            this.config.learn.reportInterval &&
            data.loss !== undefined
        ) {
            this.logger
                .addPrefix(this.stepPrefix(data.step))
                .info(`Loss = ${data.loss}`);
        }
    }

    /** Called after each rollout game. */
    private rollout(data: ModelTrainRollout<false /*TSerialized*/>): void {
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
                .addPrefix(this.stepPrefix(data.step))
                .error(
                    `Evaluation game ${data.id} threw an error: ` +
                        `${data.err.stack ?? data.err.toString()}`,
                );
        }
        // TODO: Stacked progress for eval opponents?
    }

    /** Called after finishing an evaluation run. */
    private evalDone(data: ModelTrainEvalDone): void {
        if (!this.config.eval.report) {
            return;
        }
        this.logger
            .addPrefix(this.stepPrefix(data.step))
            .addPrefix(`Evaluate(${data.opponent}): `)
            .info(`${data.win}-${data.loss}-${data.tie}`);
    }

    /** Log prefix with step number. */
    private stepPrefix(step: number): string {
        if (!this.config.steps) {
            return `Step(${step}): `;
        }
        return (
            `Step(${String(step).padStart(this.stepPadding)}/` +
            `${this.config.steps}): `
        );
    }

    /** Prints short summary of completed training session. */
    public done(): void {
        this.progress?.terminate();
        this.progress = undefined;
        this.logger
            .addPrefix("Rollout: ")
            .info(`Total games = ${this.numRolloutGames}`);
    }
}
