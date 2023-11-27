"""Worker script for serving model predictions for non-training purposes."""
import argparse
import asyncio
import json
from pathlib import Path
from typing import NamedTuple, Optional, TypedDict, Union, cast

import tensorflow as tf
import zmq
import zmq.asyncio

from .models.dqn_model import DQNModel
from .models.drqn_model import DRQNModel
from .models.utils.greedy import decode_action_rankings
from .models.utils.q_value import decode_q_values
from .utils.state import decode_state


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

    key: str
    """
    Key for looking up hidden states or other context used to continue a battle.
    """


class ModelReply(TypedDict):
    """Model prediction reply protocol."""

    type: str
    """Must be `"model"`."""

    id: int
    """Differentiates multiple requests from the same client."""

    key: str
    """Same key that was passed from the ModelRequest."""

    ranked_actions: list[str]
    """Action names ranked by the model."""

    q_values: Optional[dict[str, float]]
    """Maps action names to predicted Q-values. Optional debug info."""


class CleanupRequest(TypedDict):
    """
    Request protocol for cleaning up stored prediction context from a battle.
    """

    type: str
    """Must be `"cleanup"`."""

    key: str
    """Key identifier for the stored context."""


class Pending(NamedTuple):
    """Represents a pending request for the server."""

    routing_id: bytes
    """Id of the socket to send the result back to."""

    req: ModelRequest
    """Request json."""

    state: tf.Tensor
    """Encoded tensor state input."""


async def server(
    model_path: Path, sock_id: str, max_batch: int, debug_outputs=False
):
    """Serve worker function."""

    model: Union[DQNModel, DRQNModel] = tf.keras.models.load_model(
        model_path,
        custom_objects={"DQNModel": DQNModel, "DRQNModel": DRQNModel},
        compile=False,
    )
    is_recurrent = model.__class__.__name__ == "DRQNModel"
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

    if is_recurrent:
        hiddens: dict[str, list[tf.Tensor]] = {}

    # Naive serve loop. Only meant for lightweight demos.
    print("Serving model")
    while True:
        # Gather pending model requests.
        pending: dict[str, Pending] = {}
        while (
            max_batch <= 0 or len(pending) < max_batch
        ) and await poller.poll(timeout=0 if len(pending) > 0 else None):
            msg = await sock.recv_multipart(flags=zmq.DONTWAIT, copy=False)
            routing_id = msg[0].bytes
            req: Union[ModelRequest, CleanupRequest] = json.loads(msg[1].bytes)
            key = req["key"]
            if req["type"] == "cleanup":
                if is_recurrent:
                    del hiddens[key]
                continue
            req = cast(ModelRequest, req)
            assert req["type"] == "model"
            assert key not in pending

            state = tf.convert_to_tensor(
                decode_state(msg[2].buffer), dtype=tf.float32
            )
            pending[key] = Pending(routing_id=routing_id, req=req, state=state)
            if is_recurrent and key not in hiddens:
                hiddens[key] = DRQNModel.new_hidden()

        # Execute batch.
        keys = [*pending.keys()]
        batch_state = tf.stack([pending[key].state for key in keys])
        if not is_recurrent:
            if debug_outputs:
                ranked_actions, q_values = model.greedy_with_q(batch_state)
            else:
                ranked_actions = model.greedy(batch_state)
                q_values = None
        else:
            # Need to also handle sequence dim and hidden states.
            batch_state = tf.expand_dims(batch_state, axis=1)
            batch_hidden = list(
                map(tf.stack, zip(*(hiddens[key] for key in keys)))
            )
            if debug_outputs:
                ranked_actions, new_hiddens, q_values = model.greedy_with_q(
                    batch_state, batch_hidden
                )
                q_values = tf.squeeze(q_values, axis=1)
            else:
                ranked_actions, new_hiddens = model.greedy(
                    batch_state, batch_hidden
                )
                q_values = None
            ranked_actions = tf.squeeze(ranked_actions, axis=1)
            hiddens |= zip(keys, map(list, zip(*map(tf.unstack, new_hiddens))))

        ranked_actions = decode_action_rankings(ranked_actions)
        if q_values is not None:
            q_values = decode_q_values(q_values)
        else:
            q_values = [None] * len(pending)

        # Send replies.
        for key, action, q_dict in zip(keys, ranked_actions, q_values):
            routing_id, req, _ = pending[key]
            rep: ModelReply = {
                "type": "model",
                "id": req["id"],
                "key": key,
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
