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

## Compiling/running

```sh
# Download the repository.
git clone https://github.com/taylorhansen/pokemonshowdown-ai
cd pokemonshowdown-ai
npm install

# Setup config, edit if needed.
cp src/config/config.example.ts src/config/config.ts

# Compile the project.
npm run build

# Lint and run tests.
npm test

# Train a neural network through self-play.
# WARNING: Requires a powerful computer, may take several hours.
npm run train

# Connect to the server specified in config.ts and start accepting challenges.
npm run psbot
```

## License

See [LICENSE](/LICENSE).
