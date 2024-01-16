// istanbul ignore file
import {readFile} from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import {BattleDriver} from "../battle/BattleDriver";
import {localizeAction} from "../battle/agent/localAction";
import {gen4Parser} from "../battle/parser/gen4";
import {lookup} from "../battle/usage";
import {ModelServer} from "../model/serve";
import {Logger} from "../utils/logging/Logger";
import {PsBot} from "./PsBot";
import {PsBotConfig} from "./config";
import {BattleHandler} from "./handlers/BattleHandler";
import {wrapFinish} from "./handlers/wrappers";

const projectDir = path.resolve(__dirname, "..", "..", "..");
const defaultConfigPath = path.resolve(projectDir, "config", "psbot.yml");

void (async function psBotRunner() {
    const configPath = process.argv[2] ?? defaultConfigPath;
    const config = yaml.parse(
        (await readFile(configPath)).toString(),
    ) as PsBotConfig;

    const logger = new Logger(Logger.stderr);

    logger.debug("Starting model server");
    const modelPath = path.resolve(path.dirname(configPath), config.modelPath);
    const socketId = Math.random().toString(36).substring(2);
    const modelServer = new ModelServer(
        modelPath,
        socketId,
        config.maxBatch,
        logger.addPrefix("ModelServer: "),
    );
    await modelServer.start();

    logger.debug("Connecting to PS server");
    const bot = new PsBot(logger.addPrefix("PsBot: "));
    await bot.connect(config.websocketRoute);

    if (config.login) {
        await bot.login(config.login);
    }
    if (config.avatar) {
        bot.setAvatar(config.avatar);
    }

    const usage = await lookup("gen4randombattle");

    bot.acceptChallenges("gen4randombattle", async (room, user, sender) => {
        const driver = new BattleDriver({
            username: user,
            parser: gen4Parser,
            async agent(state, choices, agentLogger) {
                agentLogger?.debug(`State:\n${state.toString()}`);
                const prediction = await modelServer.predict(
                    room /*key*/,
                    state,
                    usage,
                    config.usageSmoothing,
                );
                agentLogger?.debug(
                    "All ranked actions: " +
                        `[${prediction.rankedActions.join(", ")}]`,
                );
                // Sort available choices by rank.
                choices.sort(
                    (a, b) =>
                        prediction.rankedActions.indexOf(a) -
                        prediction.rankedActions.indexOf(b),
                );
                if (prediction.qValues) {
                    // Include debug info to be sent to the client.
                    return prediction.rankedActions
                        .map(
                            action =>
                                `${localizeAction(state, action)}: ` +
                                prediction.qValues![action].toFixed(4),
                        )
                        .join(", ");
                }
            },
            sender,
            logger: logger.addPrefix(`BattleHandler(${room}): `),
        });

        const handler = new BattleHandler(driver);
        return await Promise.resolve(
            wrapFinish(
                handler,
                async () => await modelServer.cleanup(room /*key*/),
            ),
        );
    });

    logger.debug("Ready");
})();
