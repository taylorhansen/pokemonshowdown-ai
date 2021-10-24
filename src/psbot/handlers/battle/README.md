# `battle/`

Describes the framework for participating in a battle.

-   [BattleHandler](BattleHandler.ts): The main entry point for the battle,
    parsing the Showdown protocol to feed the appropriate events into the
    format-specific parsers.
-   [parser/BattleParser](parser/BattleParser.ts): Generic type interface for
    parsing battle events into a battle state representation suitable for making
    decisions and inferences.
-   [parser/](parser/): Helper constructs for writing a battle parser.
-   [agent/BattleAgent](agent/BattleAgent.ts): Generic type interface for making
    decisions in a battle after the events have been parsed into a battle state
    representation.
-   [ai/](ai/): Contains the AI implementations for the battle agents, as well
    as an interface for encoding battle states into a tensor for the model.
-   [formats/](formats/): Contains battle parsers, state representations, and
    state encoders for each of the supported formats.
