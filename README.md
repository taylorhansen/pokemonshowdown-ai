# Pokemon Showdown AI
[![Build Status](https://travis-ci.org/taylorhansen/pokemonshowdown-ai.svg?branch=master)](https://travis-ci.org/taylorhansen/pokemonshowdown-ai)
[![codecov](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai/branch/master/graph/badge.svg)](https://codecov.io/gh/taylorhansen/pokemonshowdown-ai)

For this project I plan on making and training a neural network to play in a Pokemon gen-4 random battle.
The code is pretty unstable right now so I wouldn't recommend trying to use it out of the box.

This project has three parts:
* [PSBot](/src/psbot) framework for creating a general Pokemon Showdown bot.
* [Battle](/src/battle) state tracker, meant to be much more precise and fine-grained than Pokemon Showdown's [client](https://github.com/Zarel/Pokemon-Showdown-Client).
* Neural network [management](/src/ai) and [training](/scripts/train) scripts.

## Compiling/running
Before running the main client, create a `src/config.ts` file using [`src/config.example.ts`](/src/config.example.ts) as a guide.

```sh
# download the repository
git clone --recursive https://github.com/taylorhansen/pokemonshowdown-ai
cd pokemonshowdown-ai
npm install

# compile submodules
./init-ps.sh

# compile codebase
npm run build

# train a neural network
# can also cancel out once the test battles start to leave a randomized network on disk
npm run train

# connect to the server specified in config.ts and start accepting challenges
npm start

# lint and run tests
npm test
```

## License
MIT.
