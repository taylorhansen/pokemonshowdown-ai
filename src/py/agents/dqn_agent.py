"""DQN agent."""
import warnings
from dataclasses import dataclass
from typing import Optional, Union, cast

import numpy as np
import tensorflow as tf

from ..environments.battle_env import AgentDict, InfoDict
from ..gen.shapes import ACTION_NAMES, MAX_REWARD, MIN_REWARD, STATE_SIZE
from ..models.dqn_model import DQNModel, DQNModelConfig
from ..models.utils.greedy import decode_action_rankings
from ..utils.typing import Experience, TensorExperience
from .agent import Agent
from .config import ExperienceConfig, KerasObjectConfig
from .utils.dqn_context import DQNContext
from .utils.epsilon_greedy import EpsilonGreedy, ExplorationConfig
from .utils.q_dist import project_target_update, zero_q_dist
from .utils.replay_buffer import ReplayBuffer


@dataclass
class DQNLearnConfig:
    """Config for DQN learning algorithm."""

    optimizer: KerasObjectConfig
    """Config for the TF Optimizer."""

    buffer_prefill: int
    """
    Fill replay buffer with some experience before starting training. Must be
    larger than `batch_size`.
    """

    batch_size: int
    """
    Batch size for gradient descent. Must be smaller than `buffer_prefill`.
    """

    steps_per_update: int
    """Step interval for computing model updates."""

    steps_per_target_update: int
    """Step interval for updating the target network."""

    steps_per_histogram: Optional[int] = None
    """
    Step interval for storing histograms of model weights, gradients, etc. Set
    to None to disable.
    """

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DQNLearnConfig from a JSON dictionary."""
        config["optimizer"] = KerasObjectConfig(**config["optimizer"])
        return cls(**config)


@dataclass
class DQNAgentConfig:
    """Config for DQN agent."""

    model: DQNModelConfig
    """Config for the model."""

    exploration: Optional[Union[float, ExplorationConfig]]
    """
    Exploration rate for epsilon-greedy. Either a constant or a decay schedule.
    Set to None to disable exploration.
    """

    experience: ExperienceConfig
    """Config for experience collection."""

    learn: DQNLearnConfig
    """Config for learning."""

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DQNAgentConfig from a JSON dictionary."""
        config["model"] = DQNModelConfig.from_dict(config["model"])
        if config.get("exploration", None) is None:
            config["exploration"] = None
        elif isinstance(config["exploration"], (int, float)):
            config["exploration"] = float(config["exploration"])
        else:
            config["exploration"] = ExplorationConfig(**config["exploration"])
        config["experience"] = ExperienceConfig.from_dict(config["experience"])
        config["learn"] = DQNLearnConfig.from_dict(config["learn"])
        return cls(**config)


class DQNAgent(Agent):
    """DQN agent for multi-agent environment."""

    def __init__(
        self,
        config: DQNAgentConfig,
        rng: Optional[tf.random.Generator] = None,
        writer: Optional[tf.summary.SummaryWriter] = None,
    ):
        """
        Creates a DQNAgent.

        :param config: Algorithm config.
        :param rng: Random number generator.
        :param writer: TF summary writer.
        """
        super().__init__()
        self.config = config
        if rng is None:
            rng = tf.random.get_global_generator()
        self.rng = rng
        self.writer = writer

        if config.exploration is not None:
            self.epsilon_greedy = EpsilonGreedy(config.exploration, rng)

        self.model = DQNModel(config=config.model, name="model")
        self.model.init()

        self.previous = DQNModel(config=config.model, name="prev")
        self.previous.init()
        self.update_prev()
        self.previous.trainable = False

        if config.experience.n_steps > 0:
            # Infinite steps reduces to episodic Monte Carlo returns, which
            # doesn't require a target network.
            self.target = DQNModel(config=config.model, name="target")
            self.target.init()
            self._update_target()
            self.target.trainable = False

        self.replay_buffer = ReplayBuffer[Experience, TensorExperience](
            max_size=config.experience.buffer_size,
            batch_cls=TensorExperience,
            priority=config.experience.priority,
        )
        self.agent_contexts: AgentDict[DQNContext] = {}

        self.step = tf.Variable(0, name="step", dtype=tf.int64)

        # Ensure optimizer state is loaded from checkpoint.
        self.optimizer = cast(
            tf.keras.optimizers.Optimizer, config.learn.optimizer.deserialize()
        )
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
        state: AgentDict[Union[np.ndarray, tf.Tensor]],
        info: AgentDict[InfoDict],
        episode: Optional[tf.Variable] = None,
        can_explore=False,
    ) -> AgentDict[list[str]]:
        """
        Selects action for each agent.

        :param state: Encoded state inputs for each battle's ready players.
        :param info: Dictionaries that include additional info for each
        battle's ready players.
        :param episode: Variable indicating the current episode.
        :param can_explore: Whether to allow exploration.
        :returns: Action names ranked by Q-value according to the model, for
        each player.
        """
        # Batch predictions for all ready players.
        agent_keys = [*state.keys()]
        model_keys = [k for k in agent_keys if k.player != "previous"]
        prev_keys = [k for k in agent_keys if k.player == "previous"]

        result: AgentDict[tf.Tensor] = {}

        if (
            can_explore
            and len(model_keys) > 0
            and self.config.exploration is not None
        ):
            if episode is None:
                raise ValueError(
                    "Missing `episode` argument for epsilon-greedy"
                )
            exploring = memoryview(
                self.epsilon_greedy.explore(len(model_keys), episode)
            )
            explore_keys = [k for k, e in zip(model_keys, exploring) if e]
            model_keys = [k for k, e in zip(model_keys, exploring) if not e]

            # Exploration.
            random_actions = self.epsilon_greedy.rand_actions(len(explore_keys))
            result |= zip(explore_keys, decode_action_rankings(random_actions))

        for keys, model in [
            (model_keys, self.model),
            (prev_keys, self.previous),
        ]:
            if len(keys) <= 0:
                continue

            # Exploitation.
            if tf.is_tensor(state[keys[0]]):
                batch_states = tf.stack(
                    [state[key] for key in keys], name="state"
                )
            else:
                batch_states = tf.convert_to_tensor(
                    np.stack([state[key] for key in keys]),
                    dtype=tf.float32,
                    name="state",
                )
            if can_explore and model.num_noisy > 0:
                greedy_actions = model.greedy_noisy(
                    batch_states, model.make_seeds(self.rng)
                )
            else:
                greedy_actions = model.greedy(batch_states)
            result |= zip(keys, decode_action_rankings(greedy_actions))

        return result

    def update_model(
        self,
        state: AgentDict[Union[np.ndarray, tf.Tensor]],
        reward: AgentDict[float],
        next_state: AgentDict[Union[np.ndarray, tf.Tensor]],
        terminated: AgentDict[bool],
        truncated: AgentDict[bool],
        info: AgentDict[InfoDict],
    ):
        """
        Updates the model using the given experience data for each agent.
        """
        # Note: state was the next_state of the last call, or an empty dict if
        # this was the first call, so this arg can be safely ignored.
        _ = state

        exps: list[Experience] = []
        for key in reward.keys():
            if key.player == "previous":
                continue

            # Note: Truncation yields no experience.
            if truncated[key]:
                if self.agent_contexts.pop(key, None) is None:
                    warnings.warn(f"Unknown key {key!r} was truncated")
                continue

            ctx = self.agent_contexts.get(key, None)
            if ctx is None:
                if terminated[key]:
                    warnings.warn(f"Unknown key {key!r} was terminated")
                    continue
                ctx = DQNContext(
                    n_steps=self.config.experience.n_steps,
                    discount_factor=self.config.experience.discount_factor,
                )
                self.agent_contexts[key] = ctx
            exps.extend(
                ctx.update(
                    info[key]["action"],
                    reward[key],
                    next_state[key],
                    info[key]["choices"],
                    terminated[key],
                )
            )
            if terminated[key]:
                del self.agent_contexts[key]

        for exp in exps:
            self.replay_buffer.add(exp)
            if len(self.replay_buffer) < self.config.learn.buffer_prefill:
                continue
            self.step.assign_add(1, read_value=False)
            if self.step % self.config.learn.steps_per_update != 0:
                continue
            with tf.profiler.experimental.Trace(
                "learn_step", step_num=self.step, _r=1
            ):
                batch, is_weights, indices = self.replay_buffer.sample(
                    self.config.learn.batch_size, step=self.step
                )
                td_error = self._learn_step(*batch, is_weights)
                self.replay_buffer.update_priorities(indices, td_error)

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="state"
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.int32, name="action"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="reward"),
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="next_state"
            ),
            tf.TensorSpec(
                shape=(None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.bool, name="done"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="is_weights"),
        ],
    )
    def _learn_step(
        self, state, action, reward, next_state, choices, done, is_weights
    ):
        """Computes a model update for an experience batch."""
        loss, td_error, hists = self._learn_step_impl(
            state, action, reward, next_state, choices, done, is_weights
        )

        hists["action"] = action
        hists["reward"] = reward
        if self.config.experience.priority is not None:
            hists["td_error"] = td_error
            hists["is_weights"] = is_weights

        logs = {"loss": loss}
        if self.config.experience.priority is not None:
            logs["is_exponent"] = self.replay_buffer.get_beta(self.step)

        self._log_metrics(logs, hists)

        return td_error

    @tf.function(
        input_signature=[
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="state"
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.int32, name="action"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="reward"),
            tf.TensorSpec(
                shape=(None, STATE_SIZE), dtype=tf.float32, name="next_state"
            ),
            tf.TensorSpec(
                shape=(None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None,), dtype=tf.bool, name="done"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="is_weights"),
        ],
        jit_compile=True,
    )
    def _learn_step_impl(
        self, state, action, reward, next_state, choices, done, is_weights
    ):
        # Ensure runtime batch size.
        batch_size = self.config.learn.batch_size
        state = tf.ensure_shape(state, (batch_size, STATE_SIZE))
        action = tf.ensure_shape(action, (batch_size,))
        reward = tf.ensure_shape(reward, (batch_size,))
        next_state = tf.ensure_shape(next_state, (batch_size, STATE_SIZE))
        choices = tf.ensure_shape(choices, (batch_size, len(ACTION_NAMES)))
        done = tf.ensure_shape(done, (batch_size,))
        is_weights = tf.ensure_shape(is_weights, (batch_size,))

        td_target = self._calculate_target(reward, next_state, choices, done)
        td_target = tf.stop_gradient(td_target)  # (N,) or (N,D)

        action_mask = tf.one_hot(action, len(ACTION_NAMES))  # (N,A)
        if self.config.model.q_value.dist is not None:
            # Broadcast over selected action's Q distribution.
            action_mask = action_mask[..., tf.newaxis]  # (N,A,1)
        action_mask = tf.stop_gradient(action_mask)

        seed = (
            tf.stop_gradient(self.model.make_seeds(self.rng))
            if self.model.num_noisy > 0
            else None
        )

        with tf.GradientTape(watch_accessed_variables=False) as tape:
            tape.watch(self.model.trainable_weights)
            q_pred, activations = self.model(
                [state, seed] if seed is not None else state,
                return_activations=True,
            )  # (N,A) or (N,A,D)
            # Select Q-value of taken action: (N,) or (N,D)
            q_pred = tf.reduce_sum(q_pred * action_mask, axis=1)
            # Loss and TD error with importance sampling weights.
            loss, td_error = self._compute_loss(td_target, q_pred, is_weights)

        # Update model.
        gradients = tape.gradient(loss, self.model.trainable_weights)
        self.optimizer.apply_gradients(
            zip(gradients, self.model.trainable_weights)
        )

        # Update target network.
        if (
            self.config.experience.n_steps > 0
            and self.step % self.config.learn.steps_per_target_update == 0
        ):
            self._update_target()

        # Return data for metrics logging.
        if self.config.model.q_value.dist is not None:
            # Record mean of Q/tgt distributions for each sample in the batch.
            support = tf.linspace(
                tf.constant(MIN_REWARD, dtype=q_pred.dtype, shape=(1,)),
                tf.constant(MAX_REWARD, dtype=q_pred.dtype, shape=(1,)),
                self.config.model.q_value.dist,
                axis=-1,
            )  # (1,D)
            q_pred = tf.reduce_sum(q_pred * support, axis=-1)
            td_target = tf.reduce_sum(td_target * support, axis=-1)
        return (
            loss,
            td_error,
            {
                "q_pred": q_pred,
                "td_target": td_target,
                **{f"{n}/activation": a for n, a in activations.items()},
                **{
                    f"{w.name}/grads": g
                    for g, w in zip(gradients, self.model.trainable_weights)
                },
                **{
                    f"{w.name}/grad_norm": tf.sqrt(tf.reduce_sum(tf.square(g)))
                    for g, w in zip(gradients, self.model.trainable_weights)
                },
                **{
                    f"{w.name}/weights": w for w in self.model.trainable_weights
                },
            },
        )

    def _calculate_target(self, reward, next_state, choices, done):
        """
        Calculates the TD target for an experience batch.

        :param reward: Batched reward vector (or discounted summed returns).
        :param next_state: Batched tensors for the next state.
        :param choices: Batched action legality masks for next state.
        :param done: Batched terminal state indicator for next state.
        :returns: Batched temporal difference target for learning.
        """
        dist = self.config.model.q_value.dist
        n_steps = self.config.experience.n_steps
        discount_factor = self.config.experience.discount_factor
        batch_size = self.config.learn.batch_size
        if n_steps <= 0:
            # Infinite n-step reduces to episodic Monte Carlo returns: y_t = R_t
            if dist is None:
                td_target = reward
            else:
                target_next_q = zero_q_dist(dist)
                target_next_q = tf.tile(
                    target_next_q[tf.newaxis, :], [batch_size, 1]
                )  # (N,D)
                td_target = project_target_update(
                    reward,
                    target_next_q,
                    done,
                    n_steps=n_steps,
                    discount_factor=discount_factor,
                )
            return td_target

        if dist is None and n_steps <= 0:
            # Infinite n-step reduces to episodic Monte Carlo returns.
            return reward

        # Double Q-learning target using n-step returns.
        # y_t = R_t + gamma^n * Qt(s_{t+n}, argmax_a(Q(s_{t+n}, a)))
        # Where R_t = r_t + gamma*r_{t+1} + ... + (gamma^(n-1))*r_{t+n-1}
        # Note that R_t=reward (precomputed) and s_{t+n}=next_state.

        # First compute Q(s_{t+n}, a)
        # Note that we want to sample a separate NoisyNet from the one that's
        # used to later calculate the loss.
        seed = (
            self.model.make_seeds(self.rng)
            if self.model.num_noisy > 0
            else None
        )
        next_q = self.model(
            [next_state, seed] if seed is not None else next_state
        )  # (N,A) or (N,A,D)
        if dist is not None:
            # Distributional RL: Take expectation (mean) of the Q distribution.
            # (N,A,D) -> (N,A)
            support = tf.linspace(
                tf.constant(MIN_REWARD, dtype=next_q.dtype, shape=(1,)),
                tf.constant(MAX_REWARD, dtype=next_q.dtype, shape=(1,)),
                dist,
                axis=-1,
            )  # (1,D)
            next_q = tf.reduce_sum(next_q * support, axis=-1)

        # Get best action for next state: argmax_{legal(a)}(Q(s_{t+n}, a))
        next_q += (1 - choices) * (
            -1e9 if next_q.dtype != tf.float16 else tf.float16.min
        )
        next_action = tf.argmax(next_q, axis=-1, output_type=tf.int32)

        # Get target Q-value of best action: Qt(s', argmax_a(...))
        target_seed = (
            self.target.make_seeds(self.rng)
            if self.target.num_noisy > 0
            else None
        )
        target_next_q = self.target(
            [next_state, target_seed] if target_seed is not None else next_state
        )  # (N,A) or (N,A,D)
        next_action_mask = tf.one_hot(
            next_action, depth=len(ACTION_NAMES), dtype=target_next_q.dtype
        )
        if dist is None:
            target_next_q = tf.reduce_sum(
                target_next_q * next_action_mask, axis=-1
            )  # (N,)
        else:
            # Broadcast one-hot selection mask along distribution dimension.
            target_next_q = tf.reduce_sum(
                target_next_q * tf.expand_dims(next_action_mask, axis=-1),
                axis=-2,
            )  # (N,D)

        # Temporal difference target: y_t = R_{t+1} + gamma^n * Qt(...)
        if dist is None:
            target_next_q = tf.where(
                done, tf.constant(0, dtype=tf.float32), target_next_q
            )
            td_target = (
                reward + (discount_factor**n_steps) * target_next_q
            )  # (N,)
        else:
            # Distributional RL: Project TD target distribution onto Q dist.
            td_target = project_target_update(
                reward,
                target_next_q,
                done,
                n_steps=n_steps,
                discount_factor=discount_factor,
            )

        return td_target

    def _compute_loss(self, td_target, q_pred, is_weights):
        """Computes the training loss."""
        if self.config.model.q_value.dist is None:
            # MSE on Q-values.
            step_loss = tf.math.squared_difference(td_target, q_pred)
            td_error = tf.abs(td_target - q_pred)
        else:
            # Cross-entropy loss on Q-value distributions.
            step_loss = -tf.reduce_sum(td_target * tf.math.log(q_pred), axis=-1)
            td_error = step_loss
        loss = tf.reduce_mean(is_weights * step_loss)
        return loss, td_error

    @tf.function(jit_compile=True)
    def _update_target(self):
        for curr_wt, tgt_wt in zip(self.model.weights, self.target.weights):
            tgt_wt.assign(curr_wt, read_value=False)

    def _log_metrics(
        self, logs: dict[str, tf.Tensor], hists: dict[str, tf.Tensor]
    ):
        if self.writer is None:
            return
        with self.writer.as_default(step=self.step):
            for name, tensor in logs.items():
                self._record_var(name, tensor)

            # pylint: disable-next=not-context-manager
            with tf.summary.record_if(
                lambda: self.config.learn.steps_per_histogram is not None
                and self.step % self.config.learn.steps_per_histogram == 0
            ):
                for name, tensor in hists.items():
                    self._record_var(name, tensor)
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
