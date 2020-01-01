/**
 * @file Plays the neural network against itself for several times before
 * training and evaluation.
 *
 * The algorithm is as follows:
 * 1. Construct a neural network.
 * 2. Play the network against itself, storing Experience objects during play to
 *    be used for learning later.
 * 3. After a number of games, train a copy of the neural network using all of
 *    the stored Experiences.
 * 4. Evaluate the newly trained network against the old one to see if the old
 *    one should be replaced on the next training cycle. This is done by playing
 *    some number of games and seeing if the new network generally beats the
 *    old one.
 * 5. Repeat steps 2-4 as desired.
 */
import { evaluateFolder, latestModelFolder, selfPlayFolder } from
    "../../src/config";
import { train } from "./train";

train(1, 5, 100, latestModelFolder, selfPlayFolder, evaluateFolder);
