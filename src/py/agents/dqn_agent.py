"""DQN agent."""
import math
from typing import Optional

import numpy as np
import tensorflow as tf

from ..config import DQNConfig
from ..environments.battle_env import AgentDict, InfoDict
from ..gen.shapes import ACTION_NAMES, MAX_REWARD, MIN_REWARD, STATE_NAMES
from ..models.dqn_model import DQNModel
from ..models.utils.model import state_tensor_spec
from ..utils.state import State, TensorState
from ..utils.typing import Experience
from .agent import Agent
from .utils.n_step_returns import NStepReturns
from .utils.replay_buffer import ReplayBuffer


class DQNAgent(Agent):
    """DQN agent for multi-agent environment."""

    def __init__(
        self,
        config=DQNConfig,
        rng: Optional[tf.random.Generator] = None,
        writer: Optional[tf.summary.SummaryWriter] = None,
    ):
        """
        Creates a DQNMultiAgent.

        :param config: Algorithm config.
        :param rng: Random number generator.
        :param writer: TF summary writer.
        """
        super().__init__()
        self.config = config
        self.optimizer = tf.keras.optimizers.Adam(config.learn.learning_rate)
        if rng is None:
            rng = tf.random.get_global_generator()
        self.rng = rng
        self.writer = writer

        self.model = DQNModel(config=config.model, name="model")
        self.model.init()

        self.previous = DQNModel(config=config.model, name="prev")
        self.previous.init()
        self.update_prev()
        self.previous.trainable = False

        self.target = DQNModel(config=config.model, name="target")
        self.target.init()
        self._update_target()
        self.target.trainable = False

        self.replay_buffer = ReplayBuffer(
            max_size=config.experience.buffer_size
        )
        self.n_step: AgentDict[NStepReturns] = {}
        self.last_state: AgentDict[State] = {}

        self.step = tf.Variable(0, name="step", dtype=tf.int64)
        # Ensure optimizer state is loaded from checkpoint.
        self.optimizer.build(self.model.trainable_weights)

        # Log initial weights.
        if (
            writer is not None
            and config.learn.steps_per_histogram is not None
            and config.learn.steps_per_histogram > 0
        ):
            with writer.as_default(step=0):
                for weight in self.model.trainable_weights:
                    self._record_var(f"{weight.name}/weights", weight)

    def select_action(
        self,
        state: AgentDict[State],
        info: AgentDict[InfoDict],
        episode: Optional[tf.Variable] = None,
        training=False,
    ) -> AgentDict[list[str]]:
        """
        Selects action for each agent.

        :param state: Encoded state input tensors for each battle's ready
        players.
        :param info: Dictionaries that include additional info for each
        battle's ready players.
        :param episode: Variable indicating the current episode.
        :param training: Whether to use epsilon-greedy exploration.
        :returns: Action names ranked by Q-value according to the model, for
        each player.
        """
        # Batch predictions for all ready players.
        agent_keys = [*state.keys()]
        model_keys = [k for k in agent_keys if k.player != "previous"]
        prev_keys = [k for k in agent_keys if k.player == "previous"]

        result: AgentDict[tf.Tensor] = {}

        if training and len(model_keys) > 0:
            if episode is None:
                raise ValueError("Missing `episode` argument in training mode")
            exploring = memoryview(self._explore(len(model_keys), episode))
            explore_keys = [k for k, e in zip(model_keys, exploring) if e]
            model_keys = [k for k, e in zip(model_keys, exploring) if not e]

            # Exploration.
            random_actions = self._rand_actions(len(explore_keys))
            result |= zip(
                explore_keys, DQNModel.decode_ranked_actions(random_actions)
            )

        for keys, use_prev in [(model_keys, False), (prev_keys, True)]:
            if len(keys) <= 0:
                continue
            # Exploitation.
            batch_states = {
                name: tf.constant(
                    np.stack([state[key][name] for key in keys]),
                    name=f"state/{name}",
                )
                for name in STATE_NAMES
            }
            greedy_actions = (
                self.previous.greedy(batch_states)
                if use_prev
                else self.model.greedy(batch_states)
            )
            result |= zip(keys, DQNModel.decode_ranked_actions(greedy_actions))

        return result

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(), dtype=tf.int32, name="num"),
            tf.TensorSpec(shape=(), dtype=tf.int64, name="episode"),
        ]
    )
    def _explore(self, num, episode):
        return self.rng.uniform(shape=(num,)) < self.get_epsilon(episode)

    @tf.function(
        input_signature=[
            tf.TensorSpec(shape=(), dtype=tf.int64, name="episode"),
        ],
        jit_compile=True,
    )
    def get_epsilon(self, episode):
        """Gets the current exploration rate."""
        explore = self.config.exploration
        if isinstance(explore, float):
            epsilon = tf.constant(explore, tf.float32)
        elif explore.decay_type == "linear":
            # Linearly interpolate through the points (0, start) and
            # (episodes, end) where x=episode and y=epsilon.
            # Equation: epsilon = start - (decay_rate * episode)
            # Solution: decay_rate = (start - end) / episodes
            epsilon = explore.start - (
                tf.cast(episode, dtype=tf.float32)
                * (explore.start - explore.end)
                / explore.episodes
            )
        elif explore.decay_type == "exponential":
            # Exponentially interpolate through the points (0, start) and
            # (episodes, end) where x=episode and y=epsilon.
            # Equation: epsilon = start * (decay_rate**episode)
            # Solution: decay_rate = (end/start) ** (1/episodes)
            # Using log transformation on epsilon for numerical stability.
            epsilon = explore.start * tf.math.exp(
                tf.cast(episode, tf.float32)
                / explore.episodes
                * tf.math.log(explore.end / explore.start)
            )
        else:
            # Thrown at trace time.
            raise RuntimeError(
                "Exploration config has unknown decay_type "
                f"'{explore.decay_type}'"
            )
        epsilon = tf.maximum(explore.end, epsilon)
        return epsilon

    @tf.function(
        input_signature=[tf.TensorSpec(shape=(), dtype=tf.int32, name="num")]
    )
    def _rand_actions(self, num):
        return tf.map_fn(
            lambda seed: tf.random.experimental.stateless_shuffle(
                tf.range(len(ACTION_NAMES)), seed=seed
            ),
            tf.transpose(self.rng.make_seeds(num)),
            fn_output_signature=tf.TensorSpec(
                shape=(len(ACTION_NAMES),), dtype=tf.int32
            ),
        )

    def update_model(
        self,
        state: AgentDict[State],
        reward: AgentDict[float],
        next_state: AgentDict[State],
        terminated: AgentDict[bool],
        truncated: AgentDict[bool],
        info: AgentDict[InfoDict],
    ):
        """
        Updates the model using the given experience data for each agent.
        """
        # Track initial state.
        # Note: Keys of states may be different from the rest of the arguments
        # due to the env.step() returned dicts only containing entries for ready
        # agents.
        for key, agent_state in state.items():
            if key.player == "previous":
                continue
            if self.last_state.get(key, None) is None:
                self.last_state[key] = agent_state

        exps: list[Experience] = []
        for key in reward.keys():
            if key.player == "previous":
                continue
            if truncated[key]:
                # Truncated indicates no more experience.
                self.n_step.pop(key, None)
                self.last_state.pop(key, None)
                continue

            # Use saved last state since the current states arg often has
            # different keys than next_states due to the asynchronous nature of
            # the optionally-parallel multi-agent BattleEnv.
            last_state = self.last_state.pop(key, None)
            if last_state is None:
                # Battle only just started for this agent.
                # Need to wait for the next update_model() call before we can
                # construct a full state transition (i.e. Experience).
                continue

            exp = Experience(
                state=last_state,
                action=info[key]["action"],
                reward=reward[key],
                next_state=next_state[key],
                choices=info[key]["choices"],
                done=terminated[key],
            )
            assert exp.action >= 0
            if not exp.done:
                assert len(exp.choices) > 0

            if key not in self.n_step:
                self.n_step[key] = NStepReturns(
                    steps=self.config.experience.n_steps,
                    discount_factor=self.config.experience.discount_factor,
                )
            processed_exps = self.n_step[key].add_experience(exp)
            exps.extend(processed_exps)

        for exp in exps:
            self.replay_buffer.add(exp)
            self.step.assign_add(1, read_value=False)
            if (
                self.replay_buffer.size >= self.config.learn.buffer_prefill
                and self.step % self.config.learn.steps_per_update == 0
            ):
                with tf.profiler.experimental.Trace(
                    "learn_step",
                    step_num=self.step,
                    batch_size=self.config.learn.batch_size,
                    _r=1,
                ):
                    batch = self.replay_buffer.sample(
                        self.config.learn.batch_size
                    )
                    self._learn_step(*batch)

    @tf.function(
        input_signature=[
            state_tensor_spec("state"),
            tf.TensorSpec(shape=(None,), dtype=tf.int32, name="action"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="reward"),
            state_tensor_spec("next_state"),
            tf.TensorSpec(
                shape=(None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.bool, name="done"),
        ],
    )
    def _learn_step(
        self,
        state: TensorState,
        action: tf.Tensor,
        reward: tf.Tensor,
        next_state: TensorState,
        choices: tf.Tensor,
        done: tf.Tensor,
    ):
        """Computes a model update for an experience batch."""
        loss, activations, gradients, q_pred, td_target = self._learn_step_impl(
            state, action, reward, next_state, choices, done
        )
        self._log_metrics(
            loss, activations, gradients, q_pred, td_target, action, reward
        )

    @tf.function(
        input_signature=[
            state_tensor_spec("state"),
            tf.TensorSpec(shape=(None,), dtype=tf.int32, name="action"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="reward"),
            state_tensor_spec("next_state"),
            tf.TensorSpec(
                shape=(None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.bool, name="done"),
        ],
        jit_compile=True,
    )
    def _learn_step_impl(
        self,
        state: TensorState,
        action: tf.Tensor,
        reward: tf.Tensor,
        next_state: TensorState,
        choices: tf.Tensor,
        done: tf.Tensor,
    ):
        td_target = self._calculate_target(reward, next_state, choices, done)
        td_target = tf.stop_gradient(td_target)  # (B,) or (B, D)

        action_mask = tf.one_hot(action, len(ACTION_NAMES))  # (B, A)
        if self.config.model.dist is not None:
            # Broadcast over selected action's Q distribution.
            action_mask = tf.expand_dims(action_mask, axis=-1)  # (B, A, 1)
        action_mask = tf.stop_gradient(action_mask)

        with tf.GradientTape(watch_accessed_variables=False) as tape:
            tape.watch(self.model.trainable_weights)
            q_pred, activations = self.model(
                state, training=True, return_activations=True
            )  # (B, A) or (B, A, D)
            # Select Q-value of taken action.
            q_pred = tf.reduce_sum(
                q_pred * action_mask, axis=1
            )  # (B,) or (B, D)
            loss = self._compute_loss(td_target, q_pred)

        # Update model.
        gradients = tape.gradient(loss, self.model.trainable_weights)
        self.optimizer.apply_gradients(
            zip(gradients, self.model.trainable_weights)
        )

        # Update target network.
        if self.step % self.config.learn.steps_per_target_update == 0:
            self._update_target()

        # Return data for metrics logging.
        if self.config.model.dist is not None:
            # Record mean of Q/tgt distributions for each sample in the batch.
            support = tf.expand_dims(
                tf.linspace(
                    float(MIN_REWARD),
                    float(MAX_REWARD),
                    self.config.model.dist,
                ),
                axis=0,
            )
            q_pred = tf.reduce_sum(q_pred * support, axis=-1)
            td_target = tf.reduce_sum(td_target * support, axis=-1)
        return loss, activations, gradients, q_pred, td_target

    def _calculate_target(
        self,
        reward: tf.Tensor,
        next_state: TensorState,
        choices: tf.Tensor,
        done: tf.Tensor,
    ) -> tf.Tensor:
        """
        Calculates the TD target for an experience batch.

        :param reward: Batched reward vector (or discounted summed returns).
        :param next_state: Batched tensors for the next state.
        :param choices: Batched action legality masks for next state.
        :param done: Batched terminal state indicator for next state.
        :returns: Batched temporal difference target for learning.
        """
        if self.config.model.dist is None and math.isinf(
            self.config.experience.n_steps
        ):
            # Infinite n-step reduces to episodic Monte Carlo returns.
            return reward

        if self.config.model.dist is not None:
            support = tf.expand_dims(
                tf.linspace(
                    float(MIN_REWARD), float(MAX_REWARD), self.config.model.dist
                ),
                axis=0,
            )

        # Double DQN target: r + gamma^n * Qt(s', argmax_a(Q(s', a))).
        tgt_next_q = self.target(next_state)
        next_q = self.model(next_state)  # (B, A) or (B, A, D)

        if self.config.model.dist is not None:
            # Distributional RL: Take expectation (mean) of the Q distribution.
            # (B, A, D) -> (B, A)
            next_q = tf.reduce_sum(next_q * support, axis=-1)

        # Mask out illegal actions from argmax.
        next_q += (1 - choices) * -1e9
        # Get best action for next state: argmax_a(Q(s', a))
        next_action = tf.argmax(next_q, axis=-1, output_type=tf.int32)
        # Get target Q value of best action: Qt(s', argmax_a(...))
        next_action_mask = tf.one_hot(next_action, depth=len(ACTION_NAMES))
        if self.config.model.dist is not None:
            # Broadcast along distribution dimension.
            next_action_mask = tf.expand_dims(next_action_mask, axis=-1)
        tgt_next_q = tf.reduce_sum(
            tgt_next_q * next_action_mask, axis=1
        )  # (B,) or (B, D)

        # Apply reward and discount factor: r + gamma^n * Qt(...)
        if self.config.model.dist is not None:
            # Distributional RL: Project target TD distribution onto original.

            # Supports of TD target distribution.
            td_target_support: tf.Tensor
            if math.isinf(self.config.experience.n_steps):
                # Infinite n-step reduces to episodic Monte Carlo returns.
                td_target_support = tf.broadcast_to(
                    tf.expand_dims(reward, axis=-1),
                    shape=(
                        self.config.learn.batch_size,
                        self.config.model.dist,
                    ),
                )  # (B, D)
            else:
                td_target_support = tf.expand_dims(reward, axis=-1) + tf.where(
                    tf.expand_dims(done, axis=-1),
                    tf.constant(0, dtype=tf.float32),
                    self.config.experience.discount_factor
                    ** self.config.experience.n_steps
                    * support,
                )  # (B, D)

            # Project TD target supports onto original Q-value distribution.
            index = (td_target_support - MIN_REWARD) / (
                (MAX_REWARD - MIN_REWARD) / (self.config.model.dist - 1)
            )
            low, high = tf.math.floor(index), tf.math.ceil(index)  # (B, D)
            batch_indices = tf.range(
                0, self.config.learn.batch_size, dtype=tf.int32
            )
            batch_indices = tf.expand_dims(
                tf.broadcast_to(
                    tf.expand_dims(batch_indices, axis=-1),
                    shape=(
                        self.config.learn.batch_size,
                        self.config.model.dist,
                    ),
                ),
                axis=-1,
            )  # (B, D, 1)
            # Should be correct and efficient for batched dist RL updates.
            # Note: tf.concat() and tf.expand_dims() seem to be broken according
            # to the linter.
            # pylint: disable=unexpected-keyword-arg, no-value-for-parameter
            td_target = tf.tensor_scatter_nd_add(
                tf.scatter_nd(
                    indices=tf.concat(
                        [
                            batch_indices,
                            tf.expand_dims(tf.cast(low, tf.int32), axis=-1),
                        ],
                        axis=-1,
                    ),  # (B, D, 2)
                    updates=tgt_next_q * (high - index),
                    shape=(
                        self.config.learn.batch_size,
                        self.config.model.dist,
                    ),
                ),
                indices=tf.concat(
                    [
                        batch_indices,
                        tf.expand_dims(tf.cast(high, tf.int32), axis=-1),
                    ],
                    axis=-1,
                ),  # (B, D, 2)
                updates=tgt_next_q * (index - low),
            )  # (B, D)
            # pylint: enable=unexpected-keyword-arg, no-value-for-parameter
        else:
            # Apply n-step TD target normally.
            tgt_next_q = tf.where(
                done, tf.constant(0, dtype=tf.float32), tgt_next_q
            )
            td_target = (
                reward
                + (
                    self.config.experience.discount_factor
                    ** self.config.experience.n_steps
                )
                * tgt_next_q
            )  # (B,)

        return td_target

    def _compute_loss(
        self, td_target: tf.Tensor, q_pred: tf.Tensor
    ) -> tf.Tensor:
        if self.config.model.dist is not None:
            # Distributional RL: Cross-entropy loss.
            return tf.reduce_mean(
                tf.keras.losses.categorical_crossentropy(td_target, q_pred)
            )
        return tf.reduce_mean(
            tf.keras.losses.mean_squared_error(td_target, q_pred)
        )

    @tf.function(jit_compile=True)
    def _update_target(self):
        for curr_wt, tgt_wt in zip(self.model.weights, self.target.weights):
            tgt_wt.assign(curr_wt, read_value=False)

    def _log_metrics(
        self, loss, activations, gradients, q_pred, td_target, action, reward
    ):
        if self.writer is None:
            return
        with self.writer.as_default(step=self.step):
            self._record_var("loss", loss)
            # pylint: disable-next=not-context-manager
            with tf.summary.record_if(
                lambda: self.config.learn.steps_per_histogram is not None
                and self.step % self.config.learn.steps_per_histogram == 0
            ):
                for name, activation in activations.items():
                    self._record_var(f"{name}/activation", activation)

                for weight, grad in zip(
                    self.model.trainable_weights, gradients
                ):
                    self._record_var(f"{weight.name}/weights", weight)
                    self._record_var(f"{weight.name}/grads", grad)

                self._record_var("action", action)
                self._record_var("reward", reward)

                self._record_var("q_pred", q_pred)
                self._record_var("td_target", td_target)

                self.writer.flush()

    def _record_var(self, name: str, tensor: tf.Tensor):
        if tensor.shape.rank == 0:
            tf.summary.scalar(name, tensor, step=self.step)
        else:
            tf.summary.histogram(name, tensor, step=self.step)

    @tf.function(jit_compile=True)
    def update_prev(self):
        """Updates the previous network."""
        for curr_wt, prev_wt in zip(self.model.weights, self.previous.weights):
            prev_wt.assign(curr_wt, read_value=False)
