/** Base type for AdvantageConfigs. */
interface AdvantageConfigBase<T extends string>
{
    readonly type: T;
    /** Discount factor for future rewards. */
    readonly gamma: number;
    /**
     * Whether to standardize the advantage estimates (subtract by mean, divide
     * by standard deviation). This generally leads to better stability during
     * training by encouraging half of the performed actions and discouraging
     * the other half.
     */
    readonly standardize?: boolean;
}

/**
 * Estimate advantage using the REINFORCE algorithm, meaning only the discount
 * reward sums are used.
 */
export interface ReinforceConfig extends AdvantageConfigBase<"reinforce"> {}

/**
 * Estimate advantage using the actor-critic model (advantage actor critic, or
 * A2C), where the discount returns are subtracted by a baseline (i.e.
 * state-value in this case) rather than standardizing them like in REINFORCE.
 * This works under the definition of the Q-learning function
 * `Q(s,a) = V(s) + A(s,a)`.
 */
export interface A2CConfig extends AdvantageConfigBase<"a2c"> {}

/**
 * Generalized advantage estimation. Usually better at controlling bias and
 * variance.
 */
export interface GAEConfig extends AdvantageConfigBase<"generalized">
{
    /** Controls bias-variance tradeoff. Must be between 0 and 1 inclusive. */
    readonly lambda: number;
}

/** Args object for advantage estimator. */
export type AdvantageConfig = ReinforceConfig | A2CConfig | GAEConfig;

/** Base class for AlgorithmArgs. */
interface AlgorithmArgsBase<T extends string>
{
    type: T;
    /** Type of advantage estimator to use. */
    readonly advantage: AdvantageConfig;
    /**
     * If provided, fit the value function separately and weigh it by the
     * provided value with respect to the actual policy gradient loss.
     */
    readonly valueCoeff?: number;
    /**
     * If provided, subtract an entropy bonus from the loss, weighing it by the
     * provided value with respect to the actual policy gradient loss. This
     * generally makes the network favor situations that give it multiple
     * favorable options to promote adaptability and unpredictability.
     */
    readonly entropyCoeff?: number;
}

/** Vanilla policy gradient algorithm. */
export interface PGArgs extends AlgorithmArgsBase<"pg"> {}

/** Base interface for PPOVariantArgs. */
interface PPOVariantBase<T extends string>
{
    /**
     * Type of PPO variant to use.
     * `clipped` - Clipped probability ratio.
     * `klFixed` - Fixed coefficient for a KL-divergence penalty.
     * `klAdaptive` - Adaptive coefficient for a KL-divergence penalty.
     * @see https://arxiv.org/pdf/1707.06347.pdf
     */
    readonly variant: T;
}

/** PPO variant that uses ratio clipping instead of. */
interface PPOVariantClipped extends PPOVariantBase<"clipped">
{
    /** Ratio clipping hyperparameter. */
    readonly epsilon: number;
}

/** PPO variant that uses a fixed coefficient for a KL-divergence penalty. */
interface PPOVariantKLFixed extends PPOVariantBase<"klFixed">
{
    /** Penalty coefficient. */
    readonly beta: number;
}

/**
 * PPO variant that uses an adaptive coefficient for a KL-divergence penalty.
 */
interface PPOVariantKLAdaptive extends PPOVariantBase<"klAdaptive">
{
    /**
     * Target KL-divergence penalty. The penalty coefficient will adapt to
     * produce this value after each learning step.
     */
    readonly klTarget: number;
    /**
     * Adaptive penalty coefficient. This will change for each learning step.
     * Usually it's best to omit this argument (will assume 1 by default) since
     * it usually adjusts to an optimal value quickly.
     */
    beta?: number;
}

/** Additional parameters for selecting a variant of PPO. */
type PPOVariantArgs = PPOVariantClipped | PPOVariantKLFixed |
    PPOVariantKLAdaptive;

/** Proximal policy optimization algorithm. */
export type PPOArgs = AlgorithmArgsBase<"ppo"> & PPOVariantArgs;

/** Arguments for customizing the learning algorithm. */
export type AlgorithmArgs = PGArgs | PPOArgs;
