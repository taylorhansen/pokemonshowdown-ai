import { Protocol } from "@pkmn/protocol";
import { Transform, TransformCallback } from "stream";
import { Logger } from "../../Logger";
import { HaltEvent, RoomEvent } from "./Event";

/**
 * Transform stream that parses PS protocol messages in chunks. Takes in
 * `string`s (in object mode), outputs {@link RoomEvent RoomEvents}.
 */
export class MessageParser extends Transform
{
    constructor(private readonly logger?: Logger)
    {
        super({objectMode: true});
    }

    /** @override */
    _transform(chunk: string, encoding: BufferEncoding,
        callback: TransformCallback): void
    {
        try
        {
            this.logger?.debug(`Received:\n${chunk}`);
            const rooms = new Set<Protocol.RoomID>();
            for (const msg of Protocol.parse(chunk) as Generator<RoomEvent>)
            {
                this.push(msg);
                rooms.add(msg.roomid)
            }
            // also send a "halt" signal after parsing a block
            for (const roomid of rooms)
            {
                const msg: HaltEvent = {roomid, args: ["halt"], kwArgs: {}};
                this.push(msg)
            }
        }
        catch (e: any)
        {
            // istanbul ignore next: should never happen
            return callback(e);
        }
        callback();
    }
}
