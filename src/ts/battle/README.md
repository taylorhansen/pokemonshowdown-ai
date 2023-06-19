# `battle/`

Describes the framework for participating in a battle.

Modules:

-   [BattleDriver](BattleDriver.ts): The main entry point for the battle,
    parsing the Showdown protocol to feed the appropriate events into the battle
    parser.
-   [parser/](parser/): All the parser code for handling inferences on battle
    behavior and interactions between various mechanics.
-   [dex/](dex/): Extra typings and generated code for accessing game data.
-   [agent/BattleAgent](agent/BattleAgent.ts): Generic type interface for making
    decisions in a battle after the events have been parsed into a battle state
    representation. This folder also includes some example baseline agents.
-   [state/BattleState](state/BattleState.ts): Battle state representation used
    by the parser and encoder.
-   [state/encoder/](state/encoder/): Compiles the battle state into a set of
    vectors suitable for use in a neural network.
-   [worker/](worker/): Used by the [training script](../../py/train.py) to host
    simulator battles for reinforcement learning.
