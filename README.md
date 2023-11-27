# Pokemon Showdown AI

[![Build](https://github.com/taylorhansen/pokemonshowdown-ai/actions/workflows/build.yml/badge.svg)](https://github.com/taylorhansen/pokemonshowdown-ai/actions/workflows/build.yml)
[![codecov](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai/branch/main/graph/badge.svg?token=qRdGD5oRzd)](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai)

Reinforcement learning project for Pokemon Showdown. Currently only supports the
Gen-4 random battle format.

This project has three parts:

-   [PsBot](/src/ts/psbot) framework for creating a general Pokemon Showdown bot
    and setting up the battle interface.
-   [Battle](/src/ts/battle) state tracker and PS protocol parser.
-   Neural network [training](/src/py/train.py) script.

https://user-images.githubusercontent.com/13547043/184581452-31b33c7e-87d5-4a26-8772-a7c365704109.mp4

_Me (left) vs a model (right) that was trained over ~16k games against itself_

## Build Instructions

Make sure you have at least Node v18 (LTS) and Miniconda 3 installed. Should
work on Linux and likely also Windows WSL2.

```sh
# Download the repository.
git clone https://github.com/taylorhansen/pokemonshowdown-ai
cd pokemonshowdown-ai

# Checkout submodules.
git submodule init
git submodule update

# Setup Python/TensorFlow.
conda env create --name psai --file environment.yml
conda activate psai

# Setup TS.
npm install
npm run build
```

## Testing

```sh
# Run formatter.
npm run format
isort src test
black src test

# Run linter.
npm run lint
pylint src test
mypy src test

# Run tests.
npm test
python -m test.unit
```

## Training

```sh
# Edit hyperparmeters as needed.
cp config/train_example.yml config/train.yml

python -m src.py.train
```

Trains the neural network through self-play. This requires a powerful computer
and/or GPU, and may take several hours depending on how it's
[configured](/config/train_example.yml).

Training logs are saved to `./experiments/` by default.

Metrics such as loss and evaluation scores can be viewed using TensorBoard.

```sh
pip install tensorboard
tensorboard --logdir experiments
```

## Running

```sh
# Edit config as needed.
cp config/psbot_example.yml config/psbot.yml

npm run psbot
```

Connects to the PS server specified in the [config](/config/psbot_example.yml)
and starts accepting battle challenges in the `gen4randombattle` format, which
is the only format that this project supports for now. By default it loads the
model from `./experiments/train/model` (assuming a training run was completed)
and connects to a locally-hosted PS instance (see
[guide](https://github.com/smogon/pokemon-showdown/blob/master/server/README.md)
on how to set one up). This allows the trained model to take on human
challengers or any other outside bots.

## License

See [LICENSE](/LICENSE).
