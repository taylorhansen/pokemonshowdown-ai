# `battle/`
This is the final step in parsing game events, where the rules of a Pokemon battle are applied to infer the battle state and make decisions based on it.

Subdirectories:
* [`agent/`](agent/) Provides a base interface for implementing the logic that decides what to do in a battle.
  Typically, an [adapter](../ai/networkAgent.ts) is used to interface with a neural network.
* [`dex/`](dex/) Contains generated data for use in a battle.
* [`driver/`](driver/) Is used as an interface between intepreted game events and actual battle state mutations and inferences.
  This is the main entry point for tracking a battle.
* [`state/`](state/) Has the data structure required for tracking all reasonably useful aspects of a battle.
