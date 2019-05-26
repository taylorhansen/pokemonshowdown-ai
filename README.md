# Pokemon Showdown AI
[![Build Status](https://travis-ci.org/CrazyGuy108/pokemonshowdown-ai.svg?branch=master)](https://travis-ci.org/CrazyGuy108/pokemonshowdown-ai)
[![codecov](https://codecov.io/gh/CrazyGuy108/pokemonshowdown-ai/branch/master/graph/badge.svg)](https://codecov.io/gh/CrazyGuy108/pokemonshowdown-ai)

For this project I plan on making and training a neural network to play in a Pokemon gen-4 random battle.
The code is pretty unstable right now so I wouldn't recommend trying to use it out of the box.

This project has three parts:
* [PSBot](/src/psbot) framework for creating a general Pokemon Showdown bot.
* [Battle](/src/battle) state tracker, meant to be much more precise and fine-grained than Pokemon Showdown's [client](https://github.com/Zarel/Pokemon-Showdown-Client).
* Neural network [management](/src/ai) and [training](/scripts/train) scripts.

## Compiling/running
Before running the main client, create a `src/config.ts` file using [`src/config.example.ts`](/src/config.example.ts) as a guide.

```sh
# compile everything
npm install
npm run build
# connect to the server and accept challenges
npm start
# lint and run tests
npm test
```

## License
MIT.
