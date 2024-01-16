import {RoomHandler} from "./handlers/RoomHandler";

/** RoomHandler with empty methods. */
export class FakeRoomHandler implements RoomHandler {
    /** @override */
    public handle() {}

    /** @override */
    public halt() {}

    /** @override */
    public finish() {}
}
