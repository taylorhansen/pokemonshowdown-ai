# Training Algorithm

This folder describes the AI model and the training algorithm (based on
[PPO](https://openai.com/blog/openai-baselines-ppo/)).

## Neural Network Architecture

The model takes in a tensor
[encoding](/src/psbot/handlers/battle/formats/gen4/encoders.ts) the
[battle state](/src/psbot/handlers/battle/formats/gen4/state/BattleState.ts) and
outputs a softmax probability for each possible
[action](/src/psbot/handlers/battle/agent/Choice.ts) that can be taken, as well
as a state-value output.

## Algorithm

1. Load the neural network to be trained, or [create](model/model.ts) one if it
   doesn't exist.
2. Do training [episodes](episode.ts) as desired:
    1. Play [several games](play/playGames.ts) against itself (usually in
       [parallel](play/pool/GamePool.ts)), collecting information about the
       agent's environment, actions, and rewards (aka
       [experience](play/experience/Experience.ts)), then
       [estimate](play/experience/augmentExperiences.ts) advantage values after
       each game.
    2. [Train](learn/learn.ts) the model using the configured policy gradient
       [loss](learn/loss.ts) function.
    3. Play evaluation games against its previous versions and log win/loss
       metrics so the user can see its progress.

Note: All TensorFlow model operations are delegated to a
[separate thread](model/worker/ModelWorker.ts) to manage batch predictions on
parallel games.
