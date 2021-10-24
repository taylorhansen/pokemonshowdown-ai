# Training Algorithm

This folder describes the neural network and the algorithm (based on
[PPO](https://openai.com/blog/openai-baselines-ppo/)) used for training it.

## Neural Network Architecture

The neural network takes in an [encoded](/src/ai/encodeBattleState.ts)
[BattleState](/src/battle/state/BattleState.ts) tensor and outputs a number for
each possible [Choice](/src/battle/agent/Choice.ts) that can be made (can be run
through a softmax function to get action probabilities), as well as a
state-value output that indicates its perceived likelihood of winning.

## Algorithm

All TensorFlow operations are delegated to a
[separate thread](nn/worker/NetworkProcessor.ts) to allow for
[parallel games](play/GamePool.ts).

1. Load the neural network to be trained, or [create](nn/model.ts) one if it
   doesn't exist.
2. Do training [episodes](episode.ts) as desired:
    1. Play [several games](play/playGames.ts) against itself, collecting
       information about the network's environment, actions, and reward (aka
       [experience](sim/helpers/Experience.ts)), then
       [estimate](nn/learn/augmentExperiences.ts) advantage values after each
       game.
    2. [Train](nn/learn/learn.ts) the neural network using the configured policy
       gradient loss function.
    3. Play evaluation games against its previous versions and log win/loss
       metrics so the user can see its progress.
