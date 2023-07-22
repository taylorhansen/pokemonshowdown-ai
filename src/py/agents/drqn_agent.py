"""DRQN agent."""
import warnings
from typing import Optional, Union

import numpy as np
import tensorflow as tf

from ..config import DRQNConfig
from ..environments.battle_env import AgentDict, AgentKey, InfoDict
from ..gen.shapes import ACTION_NAMES, MAX_REWARD, MIN_REWARD, STATE_SIZE
from ..models.drqn_model import HIDDEN_SHAPES, DRQNModel, hidden_spec
from ..models.utils.greedy import decode_action_rankings
from ..utils.typing import Trajectory
from .agent import Agent
from .utils.drqn_context import DRQNContext
from .utils.epsilon_greedy import EpsilonGreedy
from .utils.q_dist import project_target_update, zero_q_dist
from .utils.replay_buffer import ReplayBuffer


class DRQNAgent(Agent):
    """DRQN agent for multi-agent environment."""

    def __init__(
        self,
        config: DRQNConfig,
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
        self.optimizer = tf.keras.optimizers.Adam(config.learn.learning_rate)
        if rng is None:
            rng = tf.random.get_global_generator()
        self.rng = rng
        self.writer = writer

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
            max_size=config.experience.buffer_size, batch_cls=Trajectory
        )

        self.agent_contexts: AgentDict[DRQNContext] = {}

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
        training=False,
    ) -> AgentDict[list[str]]:
        """
        Selects action for each agent.

        :param state: Encoded state inputs for each battle's ready players.
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
        if training and len(model_keys) > 0:
            if episode is None:
                raise ValueError("Missing `episode` argument in training mode")
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
                batch = self.replay_buffer.sample(self.config.learn.batch_size)
                self._learn_step(*batch)

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
        ],
    )
    def _learn_step(self, hidden, mask, states, choices, actions, rewards):
        """Computes a model update for an experience batch."""
        loss, activations, gradients, q_pred, td_target = self._learn_step_impl(
            hidden, mask, states, choices, actions, rewards
        )
        self._log_metrics(
            loss, activations, gradients, q_pred, td_target, actions, rewards
        )

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
        ],
        jit_compile=True,
    )
    def _learn_step_impl(self, hidden, mask, states, choices, actions, rewards):
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

        with tf.GradientTape(watch_accessed_variables=False) as tape:
            tape.watch(self.model.trainable_weights)
            loss, activations, q_pred, td_target = self._compute_loss(
                hidden, mask, states, choices, actions, rewards
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
        if self.config.model.dist is not None:
            # Record mean of Q/tgt distributions for each sample in the batch.
            support = tf.linspace(
                tf.constant(MIN_REWARD, dtype=q_pred.dtype, shape=(1, 1)),
                tf.constant(MAX_REWARD, dtype=q_pred.dtype, shape=(1, 1)),
                self.config.model.dist,
                axis=-1,
            )  # (1,1,D)
            q_pred = tf.reduce_sum(q_pred * support, axis=-1)
            td_target = tf.reduce_sum(td_target * support, axis=-1)
        return loss, activations, gradients, q_pred, td_target

    # pylint: disable-next=too-many-branches
    def _compute_loss(self, hidden, mask, states, choices, actions, rewards):
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
        :returns: A tuple containing:
        - loss: Scalar tensor containing the training loss with proper gradient
        tracking when this function is called under a gradient tape.
        - activations: Dictionary of layer activations from the model.
        - q_pred: Predicted Q-values used for loss calculation, of shape
        `(N,L)`.
        - td_target: TD target used for loss calculation, of shape `(N,L)`.
        """
        dist = self.config.model.dist
        n_steps = max(0, self.config.experience.n_steps)
        discount_factor = self.config.experience.discount_factor
        batch_size = self.config.learn.batch_size

        burn_in = self.config.burn_in
        unroll_length = self.config.unroll_length
        if burn_in > 0:
            burnin_mask, mask = tf.split(
                mask, [burn_in, unroll_length + n_steps], axis=1
            )
            burnin_states, states = tf.split(
                states, [burn_in, unroll_length + n_steps], axis=1
            )
            # TODO: Don't store these in the first place.
            choices = choices[:, burn_in:]
            actions = actions[:, burn_in:]
            rewards = rewards[:, burn_in:]

            if n_steps > 0:
                _, target_hidden = self.target(
                    [burnin_states, hidden], mask=burnin_mask
                )
                target_hidden = list(map(tf.stop_gradient, target_hidden))

            _, hidden = self.model([burnin_states, hidden], mask=burnin_mask)
            hidden = list(map(tf.stop_gradient, hidden))
        elif n_steps > 0:
            target_hidden = hidden

        q_values, _, activations = self.model(
            [states, hidden], mask=mask, return_activations=True
        )  # (N,L+n,A) or (N,L+n,A,D)

        # Q-values of chosen actions: Q(s_t, a_t)
        if n_steps <= 0:
            q_pred = q_values  # Note n=0 for Monte Carlo returns.
        elif dist is None:
            # Q-values.
            q_pred = q_values[:, :-n_steps]  # (N,L,A)
        else:
            # Q-value distributions.
            q_pred = q_values[:, :-n_steps, :]  # (N,L,A,D)
        action_mask = tf.one_hot(
            actions, len(ACTION_NAMES), dtype=q_pred.dtype
        )  # (N,L,A)
        if dist is None:
            chosen_q = tf.reduce_sum(q_pred * action_mask, axis=-1)  # (N,L)
        else:
            # Broadcast over selected action's Q distribution.
            # Note: If actions=-1 (wherever mask=false), this is forced to zero
            # which is an invalid distribution.
            chosen_q = tf.reduce_sum(
                q_pred * tf.expand_dims(action_mask, axis=-1), axis=-2
            )  # (N,L,D)

        # Double Q-learning target using n-step returns.
        # y_t = R_t + gamma^n * Qt(s_{t+n}, argmax_a(Q(s_{t+n}, a)))
        # Where R_t = r_t + gamma*r_{t+1} + ... + (gamma^(n-1))*r_{t+n-1}
        # Note that s_t=states[t] and R_t=rewards[t] (precomputed).
        next_mask = mask[:, n_steps:] if n_steps > 0 else mask
        if n_steps <= 0:
            # Infinite n-step reduces to episodic Monte Carlo returns: y_t = R_t
            if dist is None:
                td_target = tf.cast(rewards, chosen_q.dtype)
            else:
                target_next_q = tf.cast(zero_q_dist(dist), chosen_q.dtype)
                target_next_q = tf.tile(
                    target_next_q[tf.newaxis, tf.newaxis, :],
                    [batch_size, unroll_length, 1],
                )  # (N,L,D)
                td_target = project_target_update(
                    rewards,
                    target_next_q,
                    done=tf.logical_not(next_mask),
                    n_steps=n_steps,
                    discount_factor=discount_factor,
                )
        else:
            # Shift Q-values into the future: Q(s_{t+n}, a) for t=0..L
            if dist is None:
                next_q = q_values[:, n_steps:]  # (N,L,A)
            else:
                next_q = q_values[:, n_steps:, :]  # (N,L,A,D)
            next_choices = choices[:, n_steps:]

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
            target_q, _ = self.target([states, target_hidden], mask=mask)
            best_action_mask = tf.one_hot(
                best_action, len(ACTION_NAMES), dtype=target_q.dtype
            )
            if dist is None:
                target_next_q = target_q[:, n_steps:]  # (N,L,A)
                target_next_q = tf.reduce_sum(
                    target_next_q * best_action_mask, axis=-1
                )  # (N,L)
            else:
                target_next_q = target_q[:, n_steps:, :]  # (N,L,A,D)
                target_next_q = tf.reduce_sum(
                    target_next_q * tf.expand_dims(best_action_mask, axis=-1),
                    axis=-2,
                )  # (N,L,D)

            # Temporal difference target: y_t = R_{t+1} + gamma^n * Qt(...)
            if dist is None:
                # Force target Q-values of masked/terminal states to zero.
                target_next_q_masked = tf.where(
                    next_mask,
                    target_next_q,
                    tf.constant(0, dtype=target_next_q.dtype),
                )
                scale = tf.constant(
                    discount_factor**n_steps, dtype=target_next_q_masked.dtype
                )
                td_target = rewards + (scale * target_next_q_masked)  # (N,L)
            else:
                td_target = project_target_update(
                    rewards,
                    target_next_q,
                    done=tf.logical_not(next_mask),
                    n_steps=n_steps,
                    discount_factor=discount_factor,
                )  # (N,L,D)
        td_target = tf.stop_gradient(td_target)

        # Calculate loss for each sequence element while respecting the mask.
        # This is similar to using tf.boolean_mask() except with constant shapes
        # which works better with XLA.
        curr_mask = mask[:, :-n_steps] if n_steps > 0 else mask
        if dist is None:
            # Regular DRQN: Mean squared error (MSE).
            sq_err = tf.math.squared_difference(td_target, chosen_q)
            step_loss = tf.where(
                curr_mask, sq_err, tf.constant(0, dtype=sq_err.dtype)
            )  # (N,L)
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
        # Average loss over each sequence, using mask to infer length of avg.
        seq_loss = tf.math.divide_no_nan(
            tf.reduce_sum(step_loss, axis=-1),
            tf.reduce_sum(tf.cast(curr_mask, step_loss.dtype), axis=-1),
        )  # (N,)

        # Average loss over batch.
        loss = tf.reduce_mean(seq_loss)

        return loss, activations, chosen_q, td_target

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
