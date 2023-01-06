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
-   Run the [training loop](model/worker/train.ts):
    -   Use a [thread pool](game/pool/GamePool.ts) to queue up multiple
        self-play games and collect reward/state data, called
        [experience](game/experience/Experience.ts). This is called the
        [rollout](model/worker/Rollout.ts) stage.
    -   Asynchronously feed experience into the [learner](model/worker/Learn.ts)
        to compute the model update.
    -   Play [evaluation](model/worker/Evaluate.ts) games against previous
        versions to track progress.

The entire algorithm takes place on a separate [thread](model/worker/worker.ts)
where all the Tensorflow operations are kept and
[managed](model/worker/ModelWorker.ts) by the main thread. It also manages batch
predictions for parallel games.
