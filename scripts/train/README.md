# Training Algorithm
This folder describes the neural network and the algorithm (based on [this](https://arxiv.org/pdf/1707.06347.pdf) paper) used for training it.

## Neural Network Architecture
The neural network takes in an [encoded](/src/ai/encodeBattleState.ts) [BattleState](/src/battle/state/BattleState.ts) tensor and outputs a number for each possible [Choice](/src/battle/agent/Choice.ts) that can be made (can be run through a softmax function to get action probabilities), as well as a state-value output that indicates its perceived likelihood of winning.

## Algorithm
1. Load the neural network to be trained, or [create](model.ts) one if it doesn't exist.
2. Execute a policy [rollout](rollout.ts) using the network, [playing](sim/simulators.ts) several games (against itself) and [estimating advantage tensors](learn/augmentExperiences.ts) based on the reward gained from each action.
3. [Optimize](learn/learn.ts) the network based on the configured policy gradient loss function, using mini-batch optimization for several epochs.
4. Repeat steps 2-3 as desired until fully trained.
