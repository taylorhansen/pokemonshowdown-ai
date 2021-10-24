# PsBot

This folder describes a framework that I came up with to write a generic Pokemon
Showdown bot that can be used for battles, but can also be extended for other
purposes.

Some important modules:

-   [PsBot](PsBot.ts): The main bot class, which can login and setup the parser
    and room handlers.
-   [parser/MessageParser](parser/MessageParser.ts): Parses messages from the
    Pokemon Showdown server protocol.
-   [handlers/RoomHandler](handlers/RoomHandler.ts): Objects that can be
    assigned to a certain room to process messages from it, e.g. a chatroom or a
    battle.
