import { RoomHandler } from "./handlers/RoomHandler";

/** RoomHandler with empty methods. */
export class FakeRoomHandler implements RoomHandler
{
    public handle() {}
    public halt() {}
}
