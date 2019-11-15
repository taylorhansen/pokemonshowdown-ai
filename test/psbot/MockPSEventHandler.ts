import { Side } from "../../src/battle/state/Side";
import { PlayerID } from "../../src/psbot/helpers";
import { PSEventHandler } from "../../src/psbot/PSEventHandler";

// not actually a mock but for lack of a better name
/** Mocks the PSEventHandler class to expose certain members. */
export class MockPSEventHandler extends PSEventHandler
{
    /** @override */
    public getSide(id: PlayerID): Side { return super.getSide(id); }
}
