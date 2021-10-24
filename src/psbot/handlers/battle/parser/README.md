# `parser/`

Helper constructs for writing a battle parser for a new format.

-   [`helpers`](helpers.ts): Utility functions for running a parser (by
    constructing an [iterator pair](iterators.ts)) and for verifying events from
    within a parser.
-   [`unordered/`](unordered/): Used for parsing different events in no
    particular order. Useful for when the actual order is hard to predict or
    parse exactly.
-   [`inference/`](inference/): Abstraction layer on top of `unordered/` used
    for triggering inferences after certain unordered parsers get a chance to
    parse if at all. Primitive logic system for proving/disproving why a certain
    effect did(n't) happen.
