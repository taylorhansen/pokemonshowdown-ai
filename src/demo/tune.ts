import {deserialize} from "v8";
import {config} from "../config";
import {TrainConfig} from "../config/types";
import {createModel} from "../model/model";
import {EvalResult} from "../train/Evaluate";
import {TrainingProgress} from "../train/TrainingProgress";
import {train} from "../train/train";
import {formatUptime, numDigits} from "../util/format";
import {importTf} from "../util/importTf";
import {Logger} from "../util/logging/Logger";
import {Verbose} from "../util/logging/Verbose";
import {DeepReadonlyPartial} from "../util/types";

interface TrainResult {
    /** Name of config used. */
    readonly name: string;
    /** Training loss. */
    loss: number[];
    /** Evaluation results. */
    eval: {
        [opponent: string]: Pick<
            EvalResult,
            "win" | "loss" | "tie" | "total"
        >[];
    };
    /** Running time of the training run in seconds. */
    runtime: number;
}

// TODO: Change bigint values in config to numbers.
const stringifyConfig = (obj: unknown): string =>
    JSON.stringify(obj, (_, value: unknown) =>
        typeof value === "bigint" ? `${value}n` : value,
    );
const cloneConfig = (obj: unknown): unknown =>
    JSON.parse(stringifyConfig(obj), (_, value: unknown) =>
        typeof value === "string" && value.match(/^[0-9]+n$/)
            ? BigInt(value.slice(0, -1))
            : value,
    );

const paramSearch: DeepReadonlyPartial<TrainConfig>[] =
    config.tune.searchSpace.reduce((prev, curr) =>
        prev.flatMap(cfg1 =>
            curr.map(cfg2 =>
                deepAssign(
                    cloneConfig(cfg1) as DeepReadonlyPartial<TrainConfig>,
                    cfg2,
                    {name: `${cfg1.name},${cfg2.name}`},
                ),
            ),
        ),
    );

void (async function () {
    await importTf(config.train.tf);

    const logger = new Logger(
        Logger.stderr,
        config.train.verbose ?? Verbose.Debug,
    );
    const outerLog = logger.addPrefix("Tune: ");
    outerLog.debug(`Base config: ${stringifyConfig(config.train)}`);
    outerLog.debug(`Base override: ${stringifyConfig(config.tune.override)}`);

    const results: TrainResult[] = [];

    try {
        for (let i = 0; i < paramSearch.length; ++i) {
            const params = paramSearch[i];

            const result: TrainResult = {
                name: params.name ?? stringifyConfig(params),
                loss: [],
                eval: {},
                runtime: -1,
            };

            const innerLog = logger.addPrefix(
                `Tune(${(i + 1)
                    .toString()
                    .padStart(numDigits(paramSearch.length))}/${
                    paramSearch.length
                }): `,
            );
            innerLog.debug(`Start: ${params.name}`);
            innerLog.debug(`Config: ${stringifyConfig(params)}`);

            const cfg = deepAssign(
                cloneConfig(config.train) as TrainConfig,
                config.tune.override,
                params,
            );

            const start = process.uptime();
            const model = createModel("tune", cfg.model, cfg.seeds?.model);
            const progress = cfg.progress
                ? new TrainingProgress(
                      // Don't report loss since only the last value will
                      // actually matter.
                      {...cfg, learn: {...cfg.learn, reportInterval: 0}},
                      innerLog,
                  )
                : null;
            try {
                await train(model, cfg, undefined /*paths*/, data => {
                    switch (data.type) {
                        case "step":
                            if (data.loss !== undefined) {
                                result.loss.push(data.loss);
                            }
                            progress?.callback(data);
                            break;
                        case "rollout":
                        case "eval": {
                            let err: Error | undefined;
                            if (data.err) {
                                err = deserialize(data.err) as Error;
                                innerLog.error(
                                    `Error during ${data.type}: ` +
                                        (err.stack ?? err.toString()),
                                );
                            }
                            progress?.callback({...data, err});
                            break;
                        }
                        case "evalDone":
                            (result.eval[data.opponent] ??= []).push({
                                win: data.win,
                                loss: data.loss,
                                tie: data.tie,
                                total: data.total,
                            });
                            progress?.callback(data);
                            break;
                    }
                });
            } finally {
                progress?.done();
                model.dispose();
            }
            const end = process.uptime();
            result.runtime = end - start;
            innerLog.debug(`Result: ${JSON.stringify(result)}`);
            innerLog.debug(`Runtime: ${formatUptime(result.runtime)}`);
            results.push(result);
        }
    } catch (e) {
        outerLog.error((e as Error).stack ?? (e as Error).toString());
    }
    if (results.length <= 0) {
        outerLog.error("No results");
    } else {
        switch (config.tune.target) {
            case "loss":
                outerLog.info(
                    "Best loss:\n" +
                        results
                            .sort((a, b) => a.loss.at(-1)! - b.loss.at(-1)!)
                            .map(r => `${r.loss.at(-1)!.toFixed(4)}: ${r.name}`)
                            .join("\n"),
                );
                break;
            case "runtime":
                outerLog.info(
                    "Best runtime:\n" +
                        results
                            .sort((a, b) => a.runtime - b.runtime)
                            .map(r => `${formatUptime(r.runtime)}: ${r.name}`)
                            .join("\n"),
                );
                break;
            default:
                if (!(config.tune.target in results[0].eval)) {
                    outerLog.error(
                        `Unrecognized tune target '${config.tune.target}'`,
                    );
                    break;
                }
                outerLog.info(
                    `Best eval vs ${config.tune.target}:\n` +
                        [...results]
                            .sort(
                                (a, b) =>
                                    b.eval[config.tune.target].at(-1)!.win -
                                    a.eval[config.tune.target].at(-1)!.win,
                            )
                            .slice(0, 5)
                            .map(
                                r =>
                                    `${
                                        r.eval[config.tune.target].at(-1)!.win
                                    }: ${r.name}`,
                            )
                            .join("\n"),
                );
                break;
        }
    }
    outerLog.info(`Runtime: ${formatUptime(process.uptime())}`);
})();

function deepAssign<T extends object>(
    target: T,
    ...sources: DeepReadonlyPartial<T>[]
): T {
    for (const source of sources) {
        for (const key of Object.keys(source)) {
            if (
                typeof source[key as keyof typeof source] === "object" &&
                !Array.isArray(source[key as keyof typeof source])
            ) {
                deepAssign(
                    ((target[key as keyof T] as object) ??= {}),
                    source[key as keyof typeof source] as object,
                );
            } else {
                target[key as keyof T] = source[
                    key as keyof typeof source
                ] as unknown as (typeof target)[keyof T];
            }
        }
    }
    return target;
}
