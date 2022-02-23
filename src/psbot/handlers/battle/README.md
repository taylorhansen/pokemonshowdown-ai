# `battle/`

Describes the framework for participating in a battle.

-   [BattleHandler](BattleHandler.ts): The main entry point for the battle,
    parsing the Showdown protocol to feed the appropriate events into the battle
    parser.
-   [parser/](parser/): All the parser code for handling inferences on battle
    behavior and interactions between various mechanics.
-   [dex/](dex/): Extra typings and generated code for accessing game data.
-   [agent/BattleAgent](agent/BattleAgent.ts): Generic type interface for making
    decisions in a battle after the events have been parsed into a battle state
    representation.
-   [ai/](ai/): Contains the AI implementations for the battle agents, as well
    as an interface for encoding battle states into a tensor for the model.
-   [state/BattleState](state/BattleState.ts): Battle state representation used
    by the parser and encoder.
