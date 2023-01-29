# Training Algorithm

This folder describes the AI model and the training algorithm.

## Neural Network Architecture

The [model](/src/model/model.ts) takes in a set of tensors
[encoding](/src/psbot/handlers/battle/ai/encoder/encodeState.ts) the
[battle state](/src/psbot/handlers/battle/state/BattleState.ts) and outputs an
evaluation of each possible [action](/src/psbot/handlers/battle/agent/Choice.ts)
that can be taken.

## Algorithm

-   Load the neural network to be trained, or create one if it doesn't exist.
-   Run the [training loop](train.ts):
    -   Use a [thread pool](../game/pool/GamePool.ts) to queue up multiple
        self-play games and collect reward/state data, called
        [experience](../game/experience/Experience.ts). This is called the
        [rollout](Rollout.ts) stage.
    -   Feed experience into the [learner](Learn.ts) to compute model updates.
    -   Periodically play [evaluation](Evaluate.ts) games against previous
        versions to track progress.

The entire algorithm takes place on a separate
[thread](../model/worker/worker.ts) where all the Tensorflow operations
(including batch predictions for parallel games) are kept and
[managed](../model/worker/ModelWorker.ts) asynchronously by the main thread. The
main thread is also used to [track](TrainingProgress.ts) training progress with
a progress bar if configured for it.
