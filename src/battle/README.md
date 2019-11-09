# `battle/`
This is where the rules of a Pokemon battle are implemented.

Subdirectories:
* [`agent/`](agent/) Provides a base class for implementing the logic that decides what to do.
  It can also listen for changes in the battle state to use for its own analysis.
* [`dex/`](dex/) Contains generated data for use in a battle.
* [`driver/`](driver/) Is used as an interface between intepreted game events and actual battle state mutations and inferences.
* [`state/`](state/) Has the data structure required for tracking all reasonably useful aspects of a battle.
