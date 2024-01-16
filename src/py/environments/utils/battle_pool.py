"""Backing structure for BattleEnv."""
import asyncio
import json
import os
import shutil
from asyncio.subprocess import Process
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Final, NamedTuple, Optional, Union

import numpy as np
import tensorflow as tf
import zmq
import zmq.asyncio

from ...utils.paths import PROJECT_DIR
from ...utils.random import make_prng_seeds, randstr
from ...utils.state import decode_state
from .protocol import (
    AgentFinalRequest,
    AgentReply,
    AgentRequest,
    BattleReply,
    BattleRequest,
    WorkerAck,
    WorkerReady,
)

NODE: Final = shutil.which("node") or "node"
TS_ARGS: Final = ("-r", "source-map-support/register")

# Note: See corresponding worker.ts in src for JSON protocol typings.
WORKER_JS: Final = os.fspath(
    Path(PROJECT_DIR, "dist", "ts", "battle", "worker", "worker.js").resolve()
)


@dataclass
class BattlePoolConfig:
    """Config for setting up simulator workers."""

    workers: int
    """Number of parallel workers to create."""

    per_worker: int
    """
    Number of async-parallel battles per worker. Useful for increasing
    throughput.
    """

    battles_per_log: Optional[int] = None
    """
    Store battle logs every `battles_per_log` battles. Always stored on error
    regardless of this value. Omit to not store logs except on error.
    """

    worker_timeout_ms: Optional[int] = None
    """
    Worker communication timeout in milliseconds for both starting battles and
    managing battle agents. Used for catching rare async bugs.
    """

    sim_timeout_ms: Optional[int] = None
    """
    Simulator timeout in milliseconds for processing battle-related actions and
    events. Used for catching rare async bugs.
    """


class BattleKey(NamedTuple):
    """Key type used to identify individual battles when using many workers."""

    worker_id: bytes
    """Id of the worker hosting the battle."""

    battle_id: str
    """Id of the battle hosted by the worker."""


class AgentKey(NamedTuple):
    """Unique identifier for agents acting in battles."""

    battle: BattleKey
    """Battle identifier."""

    player: str
    """
    Id of the agent acting in the battle, or `"__env__"` for omniscient view.
    """


class BattlePool:
    """
    Schedules multiple parallel Pokemon battle simulations in a custom Node.js
    subprocess pool.
    """

    def __init__(
        self,
        config: BattlePoolConfig,
        rng: Optional[tf.random.Generator] = None,
        sock_id: Optional[str] = None,
        log_path: Optional[Path] = None,
    ):
        """
        Creates a BattlePool.

        :param config: Config for simulator workers.
        :param rng: Optional random number generator.
        :param sock_id: String id for socket names.
        :param log_path: Path to store battle logs.
        """
        self.config = config
        if rng is None:
            rng = tf.random.get_global_generator()
        self.rng = rng
        if sock_id is None:
            sock_id = randstr(self.rng, 6)
        self.sock_id = sock_id
        self.log_path = log_path

        self.battle_count = 0
        self.proc_pool: dict[bytes, Process] = {}
        self.worker_load: dict[bytes, int] = {}
        self.worker_futures = deque[asyncio.Future[bytes]]()
        self.battle_futures: dict[BattleKey, asyncio.Future[BattleReply]] = {}
        self.puller: Optional[asyncio.Task] = None

        self.ctx = zmq.asyncio.Context()
        self.ctx.setsockopt(zmq.LINGER, 0)
        # Prevent messages from getting dropped.
        self.ctx.setsockopt(zmq.ROUTER_MANDATORY, 1)
        self.ctx.setsockopt(zmq.RCVHWM, 0)
        self.ctx.setsockopt(zmq.SNDHWM, 0)
        if config.worker_timeout_ms is not None:
            self.ctx.setsockopt(zmq.RCVTIMEO, config.worker_timeout_ms)
            self.ctx.setsockopt(zmq.SNDTIMEO, config.worker_timeout_ms)

        self.battle_sock = self.ctx.socket(zmq.ROUTER)
        self.battle_sock.bind(f"ipc:///tmp/psai-battle-socket-{self.sock_id}")

        self.agent_sock = self.ctx.socket(zmq.ROUTER)
        self.agent_sock.bind(f"ipc:///tmp/psai-agent-socket-{self.sock_id}")

        self.agent_poller = zmq.asyncio.Poller()
        self.agent_poller.register(self.agent_sock, zmq.POLLIN)

    def __del__(self):
        self.close()

    def close(self):
        """Closes the pool."""
        for proc in self.proc_pool.values():
            proc.kill()
        self.proc_pool.clear()
        for future in self.battle_futures.values():
            future.cancel("BattlePool.close() was called")
        if self.puller is not None:
            self.puller.cancel("BattlePool.close() was called")
        self.battle_sock.close()
        self.agent_sock.close()
        self.ctx.destroy()

    async def ready(self) -> None:
        """Initializes the simulator workers."""
        await asyncio.gather(
            *(
                self._add_worker(f"worker_{i}")
                for i in range(self.config.workers)
            )
        )

        # Wait for workers to establish connection via handshake.
        # Battle server.
        battle_ready = set(self.proc_pool.keys())
        while len(battle_ready) > 0:
            worker_id, msg = await self.battle_sock.recv_multipart()
            battle_json_msg: WorkerReady = json.loads(msg)
            assert battle_json_msg["type"] == "ready"
            battle_ack: WorkerAck = {"type": "ack"}
            await self.battle_sock.send_multipart(
                [worker_id, json.dumps(battle_ack).encode()]
            )
            battle_ready.remove(worker_id)
        # Agent server.
        agent_ready = set(self.proc_pool.keys())
        while len(agent_ready) > 0:
            worker_id, msg = await self.agent_sock.recv_multipart()
            agent_json_msg: WorkerReady = json.loads(msg)
            assert agent_json_msg["type"] == "ready"
            agent_ack: WorkerAck = {"type": "ack"}
            await self.agent_sock.send_multipart(
                [worker_id, json.dumps(agent_ack).encode()]
            )
            agent_ready.remove(worker_id)

        self.puller = asyncio.create_task(
            self._pull_results(), name="pull_results"
        )

    async def queue_battle(
        self,
        max_turns=100,
        agent1="agent1",
        agent1_model="agent1",
        agent2="agent2",
        agent2_type="model",
        agent2_model="agent2",
        training: tuple[bool, bool] = (False, False),
        suffix: str = "",
    ) -> BattleKey:
        """
        Queues a battle.

        :param max_turns: Maximum amount of turns before truncating the battle.
        :param agent1: Name of first player.
        :param agent1_model: Name of model to use for first player.
        :param agent2: Name of second player.
        :param agent2_type: If not `"model"`, indicates a custom (JS-provided)
        agent for the second player.
        :param agent2_model: Name of model to use for second player. Ignored if
        `agent2_type!="model"`.
        :param training: Whether to generate experience data for each agent.
        :param suffix: Name suffix for the log file.
        :returns: A tuple containing the assigned worker id and the id of the
        battle once it starts.
        """
        worker_id = await self._get_worker()
        self.battle_count += 1
        battle_id = f"battle_{self.battle_count}"

        key = BattleKey(worker_id=worker_id, battle_id=battle_id)
        battle_future = asyncio.get_event_loop().create_future()
        self.battle_futures[key] = battle_future

        prng_seeds = make_prng_seeds(self.rng, 3).numpy().tolist()
        req: BattleRequest = {
            "type": "battle",
            "id": battle_id,
            "agents": {
                "p1": {
                    "name": agent1,
                    "type": "model",
                    "model": agent1_model,
                    "experience": training[0],
                    "teamSeed": prng_seeds[1],
                    "randSeed": None,
                },
                "p2": {
                    "name": agent2,
                    "type": agent2_type,
                    "model": agent2_model,
                    "experience": training[1],
                    "teamSeed": prng_seeds[2],
                    "randSeed": randstr(self.rng, 16)
                    if agent2_type != "model"
                    else None,
                },
            },
            "maxTurns": max_turns,
            "logPath": os.fspath(
                Path(self.log_path, battle_id + suffix).resolve()
            )
            if self.log_path is not None
            else None,
            "onlyLogOnError": self.config.battles_per_log is None
            or self.battle_count % self.config.battles_per_log != 0,
            "seed": prng_seeds[0],
            "timeoutMs": self.config.sim_timeout_ms
            if self.config.sim_timeout_ms is not None
            else None,
        }
        await self.battle_sock.send_multipart(
            [worker_id, json.dumps(req).encode()]
        )
        return key

    async def await_battle(self, key: BattleKey) -> BattleReply:
        """
        Awaits the result from a battle. Must be called using the result from
        `queue_battle()`.

        :returns: A JSON object describing the result of the battle.
        """
        try:
            battle_result = await asyncio.wait_for(
                self.battle_futures[key], timeout=60 * 60  # 1hr
            )
        finally:
            self.battle_futures.pop(key, None)
        if battle_result.get("err", None) is not None:
            raise RuntimeError(
                f"Error in battle '{key}': {battle_result['err']}"
            )
        return battle_result

    async def agent_poll(self, timeout: Optional[int] = None) -> bool:
        """
        Waits for an agent predict request.

        :param timeout: Amount of time to wait in ms, or 0 to return
        immediately, or None to wait indefinitely.
        :returns: Whether a predict request was received.
        """
        return (
            dict(await self.agent_poller.poll(timeout=timeout)).get(
                self.agent_sock, 0
            )
            & zmq.POLLIN
            != 0
        )

    async def agent_recv(
        self, flags=0
    ) -> tuple[
        AgentKey, Union[AgentRequest, AgentFinalRequest], Optional[np.ndarray]
    ]:
        """
        Receives an agent predict request from one of the active battles.

        :param flags: ZeroMQ `Socket.recv()` flags.
        :returns: A tuple containing:
        1. Id of the request socket. Used for sending the response back via
        `agent_send()`.
        2. Parsed JSON protocol request.
        3. Encoded battle state input data, if it was transmitted.
        """
        msg = await self.agent_sock.recv_multipart(flags=flags, copy=False)
        worker_id_frame, req_frame = msg[:2]
        worker_id = worker_id_frame.bytes
        req: Union[AgentRequest, AgentFinalRequest] = json.loads(
            req_frame.bytes
        )
        state = None
        if req["type"] == "agent":
            assert len(msg) == 3
            state_frame = msg[2]
            state = decode_state(state_frame.buffer)
        elif req["type"] == "agent_final":
            assert len(msg) == 2
        else:
            raise RuntimeError(
                f"Unknown agent socket request type {req['type']}; from: {req}"
            )
        key = AgentKey(
            battle=BattleKey(worker_id=worker_id, battle_id=req["battle"]),
            player=req["name"],
        )
        return key, req, state

    async def agent_send(self, key: AgentKey, ranked_actions: list[str]):
        """
        Sends a response for a pending agent predict request.

        :param key: Identifier for the agent from `agent_recv()`.
        :param ranked_actions: List containing action names sorted in order of
        selection priority.
        """
        rep: AgentReply = {
            "type": "agent",
            "battle": key.battle.battle_id,
            "name": key.player,
            "rankedActions": ranked_actions,
        }
        await self.agent_sock.send_multipart(
            [key.battle.worker_id, json.dumps(rep).encode()]
        )

    async def _add_worker(self, worker_id: str):
        """Creates a new worker for hosting battles."""
        proc = await asyncio.create_subprocess_exec(
            NODE, *TS_ARGS, WORKER_JS, self.sock_id, worker_id
        )
        self.proc_pool[worker_id.encode()] = proc
        self.worker_load[worker_id.encode()] = 0

    async def _pull_results(self) -> None:
        """Coroutine that pulls battle results from workers."""
        # Requires a longer wait due to async battle scheduling.
        self.battle_sock.setsockopt(zmq.RCVTIMEO, -1)
        while True:
            worker_id, msg = await self.battle_sock.recv_multipart()
            self._put_worker(worker_id)
            battle_result: BattleReply = json.loads(msg)
            assert battle_result["type"] == "battle"
            key = BattleKey(worker_id=worker_id, battle_id=battle_result["id"])
            self.battle_futures[key].set_result(battle_result)

    async def _get_worker(self) -> bytes:
        """Gets a free worker task slot according to `per_worker`."""
        # Load balancing to get least busy worker.
        worker_id = min(
            self.worker_load.keys(),
            key=lambda worker_id: self.worker_load[worker_id],
        )
        if self.worker_load[worker_id] < self.config.per_worker:
            # Consume a task slot.
            self.worker_load[worker_id] += 1
        else:
            # All workers are completely busy, need to wait for a free slot.
            worker_future = asyncio.get_event_loop().create_future()
            self.worker_futures.append(worker_future)
            worker_id = await worker_future
        return worker_id

    def _put_worker(self, worker_id: bytes):
        """Indicates that a worker has opened up a free task slot."""
        if len(self.worker_futures) > 0:
            self.worker_futures.popleft().set_result(worker_id)
        else:
            if self.worker_load[worker_id] <= 0:
                raise ValueError(f"Worker {worker_id!r} already free")
            self.worker_load[worker_id] -= 1
