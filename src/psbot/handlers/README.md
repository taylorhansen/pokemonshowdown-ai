# `handlers/`

Various types of handlers for messages within a certain room, usually a battle
room.

-   [global/GlobalHandler](global/GlobalHandler.ts): Handles messages that are
    not specific to a room, e.g. for managing challenges or logging in.
-   [battle/BattleHandler](battle/BattleHandler.ts): Handles messages that are
    specific to a battle room.
