import {Transform, TransformCallback} from "stream";
import {Protocol} from "@pkmn/protocol";
import {Logger} from "../utils/logging/Logger";
import {HaltEvent, RoomEvent} from "./Event";

/**
 * Transform stream that parses PS protocol events in chunks. Takes individual
 * strings in object mode and outputs {@link RoomEvent}s.
 */
export class EventParser extends Transform {
    /**
     * Creates an EventParser.
     *
     * @param logger Optional logger object.
     */
    public constructor(private readonly logger?: Logger) {
        super({objectMode: true});
    }

    public override _transform(
        chunk: string,
        encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        try {
            this.logger?.info(`Received:\n${chunk}`);
            const rooms = new Set<Protocol.RoomID>();
            for (const msg of Protocol.parse(chunk) as Generator<RoomEvent>) {
                this.push(msg);
                rooms.add(msg.roomid);
            }
            // Also send a "halt" signal after parsing a block.
            for (const roomid of rooms) {
                const msg: HaltEvent = {roomid, args: ["halt"], kwArgs: {}};
                this.push(msg);
            }
        } catch (e) {
            // istanbul ignore next: Should never happen.
            return callback(e as Error);
        }
        callback();
    }
}
