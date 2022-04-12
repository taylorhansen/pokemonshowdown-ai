# Pokemon Showdown AI

[![Build](https://github.com/taylorhansen/pokemonshowdown-ai/actions/workflows/build.yml/badge.svg)](https://github.com/taylorhansen/pokemonshowdown-ai/actions/workflows/build.yml)
[![codecov](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai/branch/main/graph/badge.svg?token=qRdGD5oRzd)](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai)

For this project I plan on making and training a neural network to play in a
Pokemon gen-4 random battle. The code is pretty unstable right now so I wouldn't
recommend trying to use it out of the box.

This project has three parts:

-   [PsBot](/src/psbot) framework for creating a general Pokemon Showdown bot
    and setting up the battle interface.
-   [Battle](/src/psbot/handlers/battle) state tracker and PS protocol parser.
-   Neural network [management](/src/psbot/handlers/battle/ai) and
    [training](/src/train) scripts.

## Build Instructions

```sh
# Download the repository.
git clone https://github.com/taylorhansen/pokemonshowdown-ai
cd pokemonshowdown-ai
npm install

# Setup config, edit as desired.
cp src/config/config.example.ts src/config/config.ts

# Compile the project.
npm run build
```

## Testing

```sh
# Run formatter.
npm run format

# Run linter.
npm run lint

# Run tests with coverage.
npm test
```

## Training

```sh
npm run train
```

Trains the neural network through self-play. This requires a powerful computer,
and may take several hours depending on how it's
[configured](/src/config/config.example.ts).

The training script saves logs to `./logs/` and checkpoints to `./models/` (can
be changed by config). Some logs such as loss, gradients, evaluation scores,
etc. can be viewed with Tensorboard.

```sh
pip install tensorboard
tensorboard --logdir logs/tensorboard
```

## Running

```sh
npm run psbot
```

Connects to the PS server specified in the
[config](/src/config/config.example.ts) and starts accepting battle challenges
in the `gen4randombattle` format, which is the format that this project is using
for now.

## License

See [LICENSE](/LICENSE).
