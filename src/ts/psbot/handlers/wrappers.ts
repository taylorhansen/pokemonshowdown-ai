import {RoomHandler} from "./RoomHandler";

export function wrapFinish(
    handler: RoomHandler,
    onFinish: () => void | Promise<void>,
): RoomHandler {
    return {
        handle: handler.handle.bind(handler),
        halt: handler.halt.bind(handler),
        finish: async () => {
            await handler.finish();
            await onFinish();
        },
    };
}
