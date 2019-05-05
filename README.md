# Pokemon Showdown AI
[![Build Status](https://travis-ci.org/CrazyGuy108/pokemonshowdown-ai.svg?branch=master)](https://travis-ci.org/CrazyGuy108/pokemonshowdown-ai)
[![codecov](https://codecov.io/gh/CrazyGuy108/pokemonshowdown-ai/branch/master/graph/badge.svg)](https://codecov.io/gh/CrazyGuy108/pokemonshowdown-ai)

Just a little project with the end goal of creating a bot that can make smart decisions during a Pokemon battle.
My current goal for now is to have it play in Generation 4.
The code is pretty unstable right now so I wouldn't recommend trying to use it out of the box.

## Compiling/running
Before running the main client, create a `src/config.ts` file using [`src/config.example.ts`](/src/config.example.ts) as a guide.

```sh
# compile everything
npm install
npm run build
# directly execute the program
node dist/index.js

# run using ts-node client
npm run main
# lint for style errors
npm run lint
# run tests
npm test
```

## License
MIT.
