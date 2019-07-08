import { RoomHandler } from "../../src/psbot/RoomHandler";

/** RoomHandler with empty methods. */
export class FakeRoomHandler implements RoomHandler
{
    public async init() {}
    public async progress() {}
    public async request() {}
    public async error() {}
}
