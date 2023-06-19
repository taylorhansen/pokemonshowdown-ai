"""Worker script for serving model predictions for non-training purposes."""
import argparse
import asyncio
import json
from pathlib import Path
from typing import NamedTuple, Optional, TypedDict

import tensorflow as tf
import zmq
import zmq.asyncio

from .gen.shapes import STATE_NAMES
from .models.dqn_model import DQNModel
from .utils.state import TensorState, decode_tensor_state


class Ready(TypedDict):
    """Sent by parent process to ensure the worker has started."""

    type: str
    """Must be `"ready"`."""


class Ack(TypedDict):
    """Sent to parent process to acknowledge Ready."""

    type: str
    """Must be `"ack"`."""


class ModelRequest(TypedDict):
    """
    Model prediction request protocol. Encoded state data is sent in a separate
    buffer.
    """

    type: str
    """Must be `"model"`."""

    id: int
    """Differentiates multiple requests from the same client."""


class ModelReply(TypedDict):
    """Model prediction reply protocol."""

    type: str
    """Must be `"model"`."""

    id: int
    """Differentiates multiple requests from the same client."""

    ranked_actions: list[str]
    """Action names ranked by the model."""

    q_values: Optional[dict[str, float]]
    """Maps action names to predicted Q-values. Optional debug info."""


class Pending(NamedTuple):
    """Represents a pending request for the server."""

    routing_id: bytes
    """Id of the socket to send the result back to."""

    req: ModelRequest
    """Request json."""

    state: TensorState
    """Encoded tensor state input dict."""


async def server(
    model_path: Path, sock_id: str, max_batch: int, debug_outputs=False
):
    """Serve worker function."""

    model: DQNModel = tf.keras.models.load_model(
        model_path, custom_objects={"DQNModel": DQNModel}, compile=False
    )
    print(f"Loaded model from {model_path}")

    ctx = zmq.asyncio.Context.instance()
    sock = ctx.socket(zmq.ROUTER)
    sock.setsockopt(zmq.LINGER, 0)
    sock.setsockopt(zmq.ROUTER_MANDATORY, 1)
    sock.setsockopt(zmq.SNDHWM, 0)
    sock.bind(f"ipc:///tmp/psai-serve-socket-{sock_id}")

    poller = zmq.asyncio.Poller()
    poller.register(sock, zmq.POLLIN)

    # Initialize owning worker.
    routing_id, ready_bytes = await sock.recv_multipart()
    ready: Ready = json.loads(ready_bytes)
    assert ready["type"] == "ready"
    ack_msg: Ack = {"type": "ack"}
    await sock.send_multipart([routing_id, json.dumps(ack_msg).encode()])

    # Naive serve loop. Only meant for lightweight demos.
    print("Serving model")
    while True:
        # Gather pending model requests.
        pending: list[Pending] = []
        while (
            max_batch <= 0 or len(pending) < max_batch
        ) and await poller.poll(timeout=0 if len(pending) > 0 else None):
            (
                routing_id_frame,
                req_frame,
                state_frame,
            ) = await sock.recv_multipart(flags=zmq.DONTWAIT, copy=False)
            routing_id = routing_id_frame.bytes
            req: ModelRequest = json.loads(req_frame.bytes)
            assert req["type"] == "model"
            state = decode_tensor_state(state_frame.buffer)
            pending.append(Pending(routing_id=routing_id, req=req, state=state))

        # Execute batch.
        batch_state = {
            label: tf.stack([p.state[label] for p in pending])
            for label in STATE_NAMES
        }
        if debug_outputs:
            ranked_actions, q_values = model.greedy_debug(batch_state)
            q_values = DQNModel.decode_q_values(q_values)
        else:
            ranked_actions = model.greedy(batch_state)
            q_values = [None] * len(pending)
        ranked_actions = DQNModel.decode_ranked_actions(ranked_actions)

        # Send replies.
        for (routing_id, req, _), action, q_dict in zip(
            pending, ranked_actions, q_values
        ):
            rep: ModelReply = {
                "type": "model",
                "id": req["id"],
                "ranked_actions": action,
                "q_values": q_dict,
            }
            await sock.send_multipart([routing_id, json.dumps(rep).encode()])


def main():
    """Main function."""
    parser = argparse.ArgumentParser()
    parser.add_argument("model_path", type=Path)
    parser.add_argument("sock_id", type=str)
    parser.add_argument("--max-batch", default=32, type=int)
    parser.add_argument("--debug-outputs", action="store_true")

    args = parser.parse_args()

    asyncio.run(
        server(
            model_path=args.model_path,
            sock_id=args.sock_id,
            max_batch=args.max_batch,
            debug_outputs=args.debug_outputs,
        )
    )


if __name__ == "__main__":
    main()
