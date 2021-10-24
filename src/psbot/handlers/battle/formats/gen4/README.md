# `gen4/`

Generation 4 battle format.

-   [parser/](parser/): All the parser code for this format, handling inferences
    on battle behavior and interactions between various mechanics. Currently
    very unstable.
-   [dex/](dex/): Extra typings/parsers and generated code for accessing game
    data.
-   [state/BattleState](state/BattleState.ts): Battle state representation used
    by the parser and encoder.
-   [encoders/](encoders/): Encoders for battle state data, used by the model.
