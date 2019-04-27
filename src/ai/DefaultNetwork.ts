import { modelPath } from "../config";
import { Logger } from "../Logger";
import { Network } from "./Network";

/** Network that loads the default `modelPath` from config. */
export class DefaultNetwork extends Network
{
    /**
     * Creates a DefaultNetwork.
     * @param logger Logger object. Default stdout.
     */
    constructor(logger = Logger.stdout)
    {
        super(logger);
        this.ready = this.load(modelPath);
    }
}
