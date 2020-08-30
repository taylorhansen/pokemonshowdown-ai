import { DriverSwitchOptions } from "../../../src/battle/driver/BattleEvent";

/**
 * Options for switching in a Ditto for testing. Low level allows for
 * 100 hp so it can also be used as a percentage when using this for an
 * opponent.
 */
export const ditto: DriverSwitchOptions =
    {species: "ditto", level: 40, gender: null, hp: 100, hpMax: 100};

/**
 * Options for switching in a Smeargle for move testing. Low level allows for
 * 100 hp so it can also be used as a percentage when using this for an
 * opponent.
 */
export const smeargle: DriverSwitchOptions =
{
    species: "smeargle", level: 40, gender: "M", hp: 100,
    hpMax: 100
};
