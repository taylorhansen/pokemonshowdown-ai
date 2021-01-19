import * as dex from "../../../src/battle/dex/dex";
import { PokemonTraits } from "../../../src/battle/state/PokemonTraits";
import { VolatileStatus } from "../../../src/battle/state/VolatileStatus";

/** Sets every status in a VolatileStatus. */
export function setAllVolatiles(volatile: VolatileStatus): void
{
    volatile.aquaRing = true;
    volatile.boosts.atk = 1;
    volatile.confusion.start();
    volatile.curse = true;
    volatile.embargo.start();
    volatile.focusEnergy = true;
    volatile.ingrain = true;
    volatile.leechSeed = true;
    volatile.lockOn(new VolatileStatus());
    (new VolatileStatus()).lockOn(volatile);
    volatile.magnetRise.start();
    volatile.nightmare = true;
    volatile.perish = 3;
    volatile.powerTrick = true;
    volatile.substitute = true;
    volatile.suppressAbility = true;
    volatile.trap(new VolatileStatus());
    (new VolatileStatus()).trap(volatile);

    volatile.attract = true;
    volatile.bide.start();
    volatile.charge.start();
    volatile.choiceLock = "pound";
    volatile.damaged = true;
    volatile.defenseCurl = true;
    volatile.destinyBond = true;
    volatile.disableMove("tackle");
    volatile.encoreMove("splash");
    volatile.flashFire = true;
    volatile.focus = true;
    volatile.grudge = true;
    volatile.healBlock.start();
    volatile.identified = "foresight";
    volatile.imprison = true;
    volatile.lastMove = "spore";
    volatile.lockedMove.start("outrage");
    volatile.magicCoat = true;
    volatile.minimize = true;
    volatile.mirrorMove = "watergun";
    volatile.mudSport = true;
    volatile.mustRecharge = true;
    // TODO: test private moveset link
    // has truant ability
    volatile.overrideTraits = PokemonTraits.base(dex.pokemon.slaking, 100);
    volatile.addedType = "ice";
    volatile.rage = true;
    volatile.rollout.start("iceball");
    volatile.roost = true;
    volatile.slowStart.start();
    volatile.snatch = true;
    volatile.stall(true);
    volatile.stockpile = 2;
    volatile.taunt.start();
    volatile.torment = true;
    volatile.twoTurn.start("solarbeam");
    volatile.unburden = true;
    volatile.uproar.start();
    volatile.waterSport = true;
    volatile.activateTruant();
    volatile.yawn.start();
}
