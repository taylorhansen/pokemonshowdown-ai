"""DRQN agent."""
import warnings
from dataclasses import dataclass
from typing import Optional, Union, cast

import numpy as np
import tensorflow as tf

from ..environments.battle_env import AgentDict, AgentKey, InfoDict
from ..gen.shapes import ACTION_NAMES, MAX_REWARD, MIN_REWARD, STATE_SIZE
from ..models.drqn_model import (
    HIDDEN_SHAPES,
    DRQNModel,
    DRQNModelConfig,
    hidden_spec,
)
from ..models.utils.greedy import decode_action_rankings
from ..utils.typing import Trajectory
from .agent import Agent
from .config import ExperienceConfig
from .dqn_agent import DQNLearnConfig
from .utils.drqn_context import DRQNContext
from .utils.epsilon_greedy import EpsilonGreedy, ExplorationConfig
from .utils.q_dist import project_target_update, zero_q_dist
from .utils.replay_buffer import ReplayBuffer


@dataclass
class DRQNLearnConfig(DQNLearnConfig):
    """Config for DRQN learning algorithm."""


@dataclass
class DRQNAgentConfig:
    """
    Config for DRQN algorithm.

    This is the recurrent version of DQN, where recurrent hidden states are
    tracked and the replay buffer stores entire episodes from one perspective of
    the battle. As such, learning steps are not counted by individual
    environment steps (i.e. experiences or state transitions) but instead by
    collected trajectories.
    """

    model: DRQNModelConfig
    """Config for the model."""

    exploration: Optional[Union[float, ExplorationConfig]]
    """
    Exploration rate for epsilon-greedy. Either a constant or a decay schedule.
    """

    experience: ExperienceConfig
    """Config for experience collection."""

    learn: DRQNLearnConfig
    """Config for learning."""

    unroll_length: int
    """
    Number of agent steps to unroll at once when storing trajectories in the
    replay buffer and later learning from them.
    """

    burn_in: int = 0
    """
    Number of agent steps to include before the main unroll that gets skipped
    during learning, used only for deriving a useful hidden state before
    learning on the main `unroll_length`.

    Used in the R2D2 paper to counteract staleness in the hidden states that get
    stored in the replay buffer.
    https://openreview.net/pdf?id=r1lyTjAqYX
    """

    priority_mix: Optional[float] = None
    """
    Interpolate between max (1.0) and mean (0.0) TD-error when calculating
    replay priorities over each sequence. Used in the R2D2 paper. Only
    applicable when using prioritized replay.
    """

    @classmethod
    def from_dict(cls, config: dict):
        """Creates a DRQNAgentConfig from a JSON dictionary."""
        config["model"] = DRQNModelConfig.from_dict(config["model"])
        if config.get("exploration", None) is None:
            config["exploration"] = None
        elif isinstance(config["exploration"], (int, float)):
            config["exploration"] = float(config["exploration"])
        else:
            config["exploration"] = ExplorationConfig(**config["exploration"])
        config["experience"] = ExperienceConfig.from_dict(config["experience"])
        config["learn"] = DRQNLearnConfig.from_dict(config["learn"])
        return cls(**config)


class DRQNAgent(Agent):
    """DRQN agent for multi-agent environment."""

    def __init__(
        self,
        config: DRQNAgentConfig,
        rng: Optional[tf.random.Generator] = None,
        writer: Optional[tf.summary.SummaryWriter] = None,
    ):
        """
        Creates a DRQNAgent.

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

        self.model = DRQNModel(config=config.model, name="model")
        self.model.init()

        self.previous = DRQNModel(config=config.model, name="prev")
        self.previous.init()
        self.update_prev()
        self.previous.trainable = False

        if config.experience.n_steps > 0:
            # Infinite steps reduces to episodic Monte Carlo returns, which
            # doesn't require a target network.
            self.target = DRQNModel(config=config.model, name="target")
            self.target.init()
            self._update_target()
            self.target.trainable = False

        self.replay_buffer = ReplayBuffer[Trajectory, Trajectory](
            max_size=config.experience.buffer_size,
            batch_cls=Trajectory,
            priority=config.experience.priority,
        )

        self.agent_contexts: AgentDict[DRQNContext] = {}

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

    def reset(self, key: AgentKey) -> None:
        """
        Cleans up tracking information for a terminated agent. This is usually
        done automatically by `update_model()` to prevent memory leaks.
        """
        self.agent_contexts.pop(key, None)

    def select_action(
        self,
        state: AgentDict[Union[np.ndarray, tf.Tensor]],
        info: AgentDict[InfoDict],
        episode: Optional[tf.Variable] = None,
        can_explore=True,
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

        # Exploitation.
        for keys, model in [
            (model_keys, self.model),
            (prev_keys, self.previous),
        ]:
            if len(keys) <= 0:
                continue

            for key in keys:
                if key in self.agent_contexts:
                    continue
                self.agent_contexts[key] = DRQNContext(
                    hidden=DRQNModel.new_hidden(),
                    unroll_length=self.config.unroll_length,
                    burn_in=self.config.burn_in,
                    n_steps=self.config.experience.n_steps,
                    discount_factor=self.config.experience.discount_factor,
                )

            if tf.is_tensor(state[keys[0]]):
                batch_states = tf.stack([state[key] for key in keys])  # (N,X)
                # Add sequence dim: (N,L,X), L=1
                batch_states = tf.expand_dims(batch_states, axis=-2)
            else:
                batch_states = np.stack([state[key] for key in keys])
                batch_states = np.expand_dims(batch_states, axis=-2)
                batch_states = tf.convert_to_tensor(
                    batch_states, dtype=tf.float32
                )

            batch_hidden = list(
                map(
                    tf.stack,
                    zip(*(self.agent_contexts[key].hidden for key in keys)),
                )
            )

            if can_explore and model.num_noisy > 0:
                # Note: Pylint breaks on tf.function.
                # pylint: disable-next=unpacking-non-sequence
                greedy_actions, batch_hidden = model.greedy_noisy(
                    batch_states, batch_hidden, model.make_seeds(self.rng)
                )
            else:
                greedy_actions, batch_hidden = model.greedy(
                    batch_states, batch_hidden
                )
            # Remove sequence dim: (N,L,A) -> (N,A)
            greedy_actions = tf.squeeze(greedy_actions, axis=-2)
            result |= zip(keys, decode_action_rankings(greedy_actions))

            # Update hidden state for the next call.
            # Note: Recurrent state prefers list instead of zip()'s tuples.
            hiddens = map(list, zip(*map(tf.unstack, batch_hidden)))
            for key, hidden in zip(keys, hiddens):
                self.agent_contexts[key].hidden = hidden

        # Exploration.
        # Note: We explore _after_ calling the model in order to ensure the
        # continuity of the recurrent hidden state for future calls.
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

            random_actions = self.epsilon_greedy.rand_actions(len(explore_keys))
            result |= zip(explore_keys, decode_action_rankings(random_actions))

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

        trajs: list[Trajectory] = []
        for key in reward.keys():
            if key.player == "previous":
                continue

            if truncated[key]:
                ctx = self.agent_contexts.pop(key, None)
                if ctx is None:
                    warnings.warn(f"Unknown key {key!r} was truncated")
                else:
                    trajs.extend(ctx.truncate())
                continue

            ctx = self.agent_contexts.get(key, None)
            if ctx is None:
                if terminated[key]:
                    warnings.warn(f"Unknown key {key!r} was terminated")
                    continue
                ctx = DRQNContext(
                    hidden=DRQNModel.new_hidden(),
                    unroll_length=self.config.unroll_length,
                    burn_in=self.config.burn_in,
                    n_steps=self.config.experience.n_steps,
                    discount_factor=self.config.experience.discount_factor,
                )
                self.agent_contexts[key] = ctx
            trajs.extend(
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

        for traj in trajs:
            self.replay_buffer.add(traj)
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
            hidden_spec(),
            tf.TensorSpec(shape=(None, None), dtype=tf.bool, name="mask"),
            tf.TensorSpec(
                shape=(None, None, STATE_SIZE), dtype=tf.float32, name="states"
            ),
            tf.TensorSpec(
                shape=(None, None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None, None), dtype=tf.int32, name="actions"),
            tf.TensorSpec(shape=(None, None), dtype=tf.float32, name="rewards"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="is_weights"),
        ],
    )
    def _learn_step(
        self, hidden, mask, states, choices, actions, rewards, is_weights
    ):
        """Computes a model update for an experience batch."""
        loss, td_error, hists = self._learn_step_impl(
            hidden, mask, states, choices, actions, rewards, is_weights
        )

        hists["action"] = actions
        hists["reward"] = rewards
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
            hidden_spec(),
            tf.TensorSpec(shape=(None, None), dtype=tf.bool, name="mask"),
            tf.TensorSpec(
                shape=(None, None, STATE_SIZE), dtype=tf.float32, name="states"
            ),
            tf.TensorSpec(
                shape=(None, None, len(ACTION_NAMES)),
                dtype=tf.float32,
                name="choices",
            ),
            tf.TensorSpec(shape=(None, None), dtype=tf.int32, name="actions"),
            tf.TensorSpec(shape=(None, None), dtype=tf.float32, name="rewards"),
            tf.TensorSpec(shape=(None,), dtype=tf.float32, name="is_weights"),
        ],
        jit_compile=True,
    )
    def _learn_step_impl(
        self, hidden, mask, states, choices, actions, rewards, is_weights
    ):
        # Ensure runtime batch size + sequence length.
        batch_size = self.config.learn.batch_size
        unroll_length = self.config.unroll_length
        burn_in = self.config.burn_in
        n_steps = max(0, self.config.experience.n_steps)
        hidden = [
            tf.ensure_shape(h, (batch_size, *s[1:]))
            for h, s in zip(hidden, HIDDEN_SHAPES)
        ]
        mask = tf.ensure_shape(
            mask, (batch_size, burn_in + unroll_length + n_steps)
        )
        states = tf.ensure_shape(
            states, (batch_size, burn_in + unroll_length + n_steps, STATE_SIZE)
        )
        choices = tf.ensure_shape(
            choices,
            (batch_size, burn_in + unroll_length + n_steps, len(ACTION_NAMES)),
        )
        actions = tf.ensure_shape(
            actions, (batch_size, burn_in + unroll_length)
        )
        rewards = tf.ensure_shape(
            rewards, (batch_size, burn_in + unroll_length)
        )
        is_weights = tf.ensure_shape(is_weights, (batch_size,))

        with tf.GradientTape(watch_accessed_variables=False) as tape:
            tape.watch(self.model.trainable_weights)
            loss, td_error, activations, q_pred, td_target = self._compute_loss(
                hidden, mask, states, choices, actions, rewards, is_weights
            )

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
                tf.constant(MIN_REWARD, dtype=q_pred.dtype, shape=(1, 1)),
                tf.constant(MAX_REWARD, dtype=q_pred.dtype, shape=(1, 1)),
                self.config.model.q_value.dist,
                axis=-1,
            )  # (1,1,D)
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

    # TODO: Break up into smaller methods.
    # pylint: disable-next=too-many-branches, too-many-locals, too-many-statements
    def _compute_loss(
        self, hidden, mask, states, choices, actions, rewards, is_weights
    ):
        """
        Computes the training loss.

        :param hidden: List of tensors of shape `(N,X)` containing the recurrent
        hidden states used to start the trajectory.
        :param mask: Boolean tensor of shape `(N,B+L+n)` indicating terminal
        states.
        :param states: Float tensor of shape `(N,B+L+n,X)` containing battle
        states.
        :param choices: Float tensor of shape `(N,B+L+n,A)` masking the legal
        action space.
        :param actions: Int tensor of shape `(N,B+L)` containing action ids.
        :param rewards: Float tensor of shape `(N,B+L)` containing n-step
        returns.
        :param is_weights: Float tensor of shape `(N,)` containing importance
        sampling weights.
        :returns: A tuple containing:
        - loss: Scalar tensor containing the training loss with proper gradient
        tracking when this function is called under a gradient tape.
        - td_error: Loss of each sample in the batch, of shape `(N,)`.
        - activations: Dictionary of layer activations from the model.
        - q_pred: Predicted Q-values used for loss calculation, of shape
        `(N,L)`.
        - td_target: TD target used for loss calculation, of shape `(N,L)`.
        """
        dist = self.config.model.q_value.dist
        n_steps = max(0, self.config.experience.n_steps)
        discount_factor = self.config.experience.discount_factor
        batch_size = self.config.learn.batch_size

        if n_steps > 0:
            target_seed = (
                self.target.make_seeds(self.rng)
                if self.target.num_noisy > 0
                else None
            )
            # Note that we want to sample a separate NoisyNet from the one
            # that's used to calculate the loss, for each batch.
            # For performance, we also don't resample the weights between
            # sequences nor time steps, since otherwise the amount of model
            # calls would blow up too quickly.
            next_seed = (
                self.model.make_seeds(self.rng)
                if self.model.num_noisy > 0
                else None
            )
        seed = (
            tf.stop_gradient(self.model.make_seeds(self.rng))
            if self.model.num_noisy > 0
            else None
        )

        unroll_length = self.config.unroll_length
        burn_in = self.config.burn_in
        if burn_in > 0:
            burnin_mask, curr_next_mask = tf.split(
                mask, [burn_in, unroll_length + n_steps], axis=1
            )
            burnin_states, curr_next_states = tf.split(
                states, [burn_in, unroll_length + n_steps], axis=1
            )
            # TODO: Don't store these first B entries in the first place.
            curr_actions = actions[:, burn_in:]
            curr_rewards = rewards[:, burn_in:]

            if n_steps > 0:
                # Also include n-steps during burn-in since we only need
                # Q(s_{t+n}, a) when computing the target.
                burnin_pre_mask, next_mask = tf.split(
                    mask, [burn_in + n_steps, unroll_length], axis=1
                )
                curr_mask = mask[:, burn_in:-n_steps]  # (N,L)

                burnin_pre_states, next_states = tf.split(
                    states, [burn_in + n_steps, unroll_length], axis=1
                )
                curr_states = states[:, burn_in:-n_steps, :]

                next_choices = choices[:, burn_in + n_steps :, :]  # (N,L,A)

                _, target_hidden = self.target(
                    [burnin_pre_states, hidden]
                    + ([target_seed] if target_seed is not None else []),
                    mask=burnin_pre_mask,
                )

                if self.model.num_noisy > 0:
                    _, next_hidden = self.model(
                        [burnin_pre_states, hidden, next_seed],
                        mask=burnin_pre_mask,
                    )
            else:
                curr_mask = curr_next_mask
                curr_states = curr_next_states

            _, curr_hidden = self.model(
                [burnin_states, hidden] + ([seed] if seed is not None else []),
                mask=burnin_mask,
            )
            curr_hidden = list(map(tf.stop_gradient, curr_hidden))
        elif n_steps > 0:
            curr_hidden = hidden

            curr_next_mask = mask
            pre_mask, next_mask = tf.split(
                mask, [n_steps, unroll_length], axis=1
            )
            curr_mask = mask[:, :-n_steps]  # (N,L)

            curr_next_states = states
            pre_states, next_states = tf.split(
                states, [n_steps, unroll_length], axis=1
            )
            curr_states = states[:, :-n_steps, :]

            # TODO: Don't store these first n entries in the first place.
            next_choices = choices[:, n_steps:, :]

            curr_actions = actions
            curr_rewards = rewards

            _, target_hidden = self.target(
                [pre_states, hidden]
                + ([target_seed] if target_seed is not None else []),
                mask=pre_mask,
            )

            if self.model.num_noisy > 0:
                _, next_hidden = self.model(
                    [pre_states, hidden, next_seed], mask=pre_mask
                )
        else:
            curr_hidden = hidden
            curr_mask = mask
            curr_states = states
            curr_actions = actions
            curr_rewards = rewards

        # Double Q-learning target using n-step returns.
        # y_t = R_t + gamma^n * Qt(s_{t+n}, argmax_a(Q(s_{t+n}, a))) for t=0..L
        # Where R_t = r_t + gamma*r_{t+1} + ... + (gamma^(n-1))*r_{t+n-1}
        # Note that s_t=states[t] and R_t=rewards[t] (precomputed).

        # First get the Q(...) part.
        if n_steps <= 0:
            # Infinite n-step reduces to episodic Monte Carlo returns: y_t = R_t
            q_pred, _, activations = self.model(
                [curr_states, hidden], mask=curr_mask, return_activations=True
            )
        elif self.model.num_noisy > 0:
            # For target calcs: Q(s_{t+n}, a)
            next_q, _ = self.model(
                [next_states, next_hidden, next_seed], mask=next_mask
            )  # (N,L,A) or (N,L,A,D)

            # For loss calcs: Q(s_t, a_t)
            q_pred, _, activations = self.model(
                [curr_states, curr_hidden, seed],
                mask=curr_mask,
                return_activations=True,
            )  # (N,L,A) or (N,L,A,D)
        else:
            q_values, _, activations = self.model(
                [curr_next_states, curr_hidden],
                mask=curr_next_mask,
                return_activations=True,
            )  # (N,L+n,A) or (N,L+n,A,D)
            q_pred = q_values[:, :-n_steps, ...]  # Q(s_t, a_t)
            # Shift Q-values into the future, letting us elide an extra call.
            next_q = q_values[:, n_steps:, ...]  # Q(s_{t+n}, a)

        curr_action_mask = tf.one_hot(
            curr_actions, len(ACTION_NAMES), dtype=q_pred.dtype
        )  # (N,L,A)
        if dist is None:
            chosen_q = tf.reduce_sum(
                q_pred * curr_action_mask, axis=-1
            )  # (N,L)
        else:
            # Broadcast over selected action's Q distribution.
            # Note: If actions=-1 (wherever mask=false), the corresponding entry
            # in chosen_q is forced to all-zeroes which is an invalid
            # distribution. We guard for this later.
            chosen_q = tf.reduce_sum(
                q_pred * tf.expand_dims(curr_action_mask, axis=-1), axis=-2
            )  # (N,L,D)

        if n_steps <= 0:
            # Infinite n-step reduces to episodic Monte Carlo returns: y_t = R_t
            if dist is None:
                td_target = tf.cast(curr_rewards, chosen_q.dtype)
            else:
                target_next_q = tf.cast(zero_q_dist(dist), chosen_q.dtype)
                target_next_q = tf.tile(
                    target_next_q[tf.newaxis, tf.newaxis, :],
                    [batch_size, unroll_length, 1],
                )  # (N,L,D)
                td_target = project_target_update(
                    curr_rewards,
                    target_next_q,
                    done=tf.logical_not(next_mask),
                    n_steps=n_steps,
                    discount_factor=discount_factor,
                )
        else:
            # Best action: argmax_{legal(a)}(Q(s_{t+n}, a))
            small = -1e9 if next_q.dtype != tf.float16 else tf.float16.min
            illegal_mask = tf.cast(1.0 - next_choices, next_q.dtype)
            if dist is None:
                legal_q = next_q + (illegal_mask * small)
                best_action = tf.argmax(legal_q, axis=-1, output_type=tf.int32)
            else:
                # Argmax over expectations of Q-value distributions.
                legal_q = next_q + tf.expand_dims(illegal_mask * small, axis=-1)
                support = tf.linspace(
                    tf.constant(MIN_REWARD, dtype=legal_q.dtype, shape=(1, 1)),
                    tf.constant(MAX_REWARD, dtype=legal_q.dtype, shape=(1, 1)),
                    dist,
                    axis=-1,
                )  # (1,1,D)
                expected_q = tf.reduce_sum(legal_q * support, axis=-1)
                best_action = tf.argmax(
                    expected_q, axis=-1, output_type=tf.int32
                )  # (N,L)

            # Qt(s_{t+n}, argmax_a(...))
            target_next_q, _ = self.target(
                [next_states, target_hidden]
                + ([target_seed] if target_seed is not None else []),
                mask=next_mask,
            )
            best_action_mask = tf.one_hot(
                best_action, len(ACTION_NAMES), dtype=target_next_q.dtype
            )
            if dist is None:
                target_best_next_q = tf.reduce_sum(
                    target_next_q * best_action_mask, axis=-1
                )  # (N,L)
            else:
                target_best_next_q = tf.reduce_sum(
                    target_next_q * tf.expand_dims(best_action_mask, axis=-1),
                    axis=-2,
                )  # (N,L,D)

            # Temporal difference target: y_t = R_{t+1} + gamma^n * Qt(...)
            if dist is None:
                # Force target Q-values of masked/terminal states to zero.
                target_best_next_q_masked = tf.where(
                    next_mask,
                    target_best_next_q,
                    tf.constant(0, dtype=target_best_next_q.dtype),
                )
                scale = tf.constant(
                    discount_factor**n_steps,
                    dtype=target_best_next_q_masked.dtype,
                )
                td_target = curr_rewards + (scale * target_best_next_q_masked)
            else:
                # Distributional RL treats Q-value outputs as (discrete) random
                # variables, so we have to do a special projection mapping here.
                td_target = project_target_update(
                    curr_rewards,
                    target_best_next_q,
                    done=tf.logical_not(next_mask),
                    n_steps=n_steps,
                    discount_factor=discount_factor,
                )  # (N,L,D)
        td_target = tf.stop_gradient(td_target)

        # Calculate loss for each sequence element while respecting the mask.
        # This is similar to using tf.boolean_mask() except with constant shapes
        # which works better with XLA.
        if dist is None:
            # Regular DRQN: Mean squared error (MSE).
            sq_err = tf.math.squared_difference(td_target, chosen_q)
            step_loss = tf.where(
                curr_mask, sq_err, tf.constant(0, dtype=sq_err.dtype)
            )  # (N,L)
            # Use absolute TD error for calculating replay priorities.
            abs_err = tf.abs(td_target - chosen_q)
            step_error = tf.where(
                curr_mask, abs_err, tf.constant(0, dtype=abs_err.dtype)
            )
        else:
            # Distributional RL: Cross-entropy loss.
            safe_q = tf.where(
                tf.expand_dims(curr_mask, axis=-1),
                # Ensure no log(0)=NaN or log(1)=0 from softmax output.
                tf.clip_by_value(
                    chosen_q,
                    tf.constant(
                        tf.keras.backend.epsilon(), dtype=chosen_q.dtype
                    ),
                    tf.constant(
                        1.0 - tf.keras.backend.epsilon(), dtype=chosen_q.dtype
                    ),
                ),
                # Prevent NaN gradients by forcing log(q) to log(1) = 0,
                # effectively masking the loss function.
                tf.constant(1, dtype=chosen_q.dtype),
            )
            step_loss = -tf.reduce_sum(
                td_target * tf.math.log(safe_q), axis=-1
            )  # (N,L)
            # Use same distribution divergence metric for replay priorities.
            step_error = step_loss

        # Average loss over each sequence, using mask to infer lengths.
        seq_length = tf.reduce_sum(tf.cast(curr_mask, td_target.dtype), axis=-1)
        seq_loss = tf.math.divide_no_nan(
            tf.reduce_sum(step_loss, axis=-1), seq_length
        )  # (N,)
        seq_error = tf.math.divide_no_nan(
            tf.reduce_sum(step_error, axis=-1), seq_length
        )  # (N,)

        # Average loss over batch.
        loss = tf.reduce_mean(is_weights * seq_loss)

        # Balance large errors in the entire sequence with the overall average
        # sequence error when calculating replay priorities.
        td_error = (
            seq_error
            if self.config.priority_mix is None
            else (
                self.config.priority_mix * tf.reduce_max(step_error, axis=-1)
                + (1 - self.config.priority_mix) * seq_error
            )
        )

        return loss, td_error, activations, chosen_q, td_target

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
