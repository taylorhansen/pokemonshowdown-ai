# Training Algorithm

This folder describes the AI model and the training algorithm.

## Neural Network Architecture

The model takes in a set of tensors
[encoding](/src/psbot/handlers/battle/ai/encoder/encodeState.ts) the
[battle state](/src/psbot/handlers/battle/state/BattleState.ts) and outputs an
evaluation of each possible [action](/src/psbot/handlers/battle/agent/Choice.ts)
that can be taken.

## Algorithm

1. Load the neural network to be trained, or [create](model/model.ts) one if it
   doesn't exist.
2. Do training [episodes](episode.ts) as desired:
    1. Play [several games](play/playGames.ts) against itself (usually in
       [parallel](play/pool/GamePool.ts)), collecting information about the
       agent's environment, actions, and rewards (aka
       [experience](play/experience/Experience.ts)).
    2. [Train](learn/learn.ts) the model using the reward values.
    3. Play evaluation games against its previous versions and log win/loss
       metrics so the user can see its progress.

Note that all TensorFlow model operations are delegated to a
[separate thread](model/worker/ModelWorker.ts) to manage batch predictions on
parallel games.
