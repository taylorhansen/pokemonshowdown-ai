/**
 * @file Specifies how events are parsed during the initialization phase of a
 * battle.
 */
import {Protocol} from "@pkmn/protocol";
import {GenerationNum, StatID} from "@pkmn/types";
import {toIdName} from "../../../../../helpers";
import {
    BattleParserContext,
    consume,
    peek,
    tryVerify,
    unordered,
    verify,
} from "../../../parser";
import {HpType} from "../dex";
import {BattleState} from "../state";
import {TeamRevealOptions} from "../state/Team";
import {handlers as base} from "./base";

/**
 * Parses the initialization step of a battle up to but not including the first
 * switch-ins.
 */
export async function init(ctx: BattleParserContext<"gen4">): Promise<void> {
    // Initialization events.
    await unordered.all(
        ctx,
        [
            initBattle(),
            gameType(),
            player(1),
            request(),
            player(2),
            teamSize(1),
            teamSize(2),
            gen(4),
            tier(),
            rules(),
            // TODO: |rated|, |seed|, |split|, |teampreview|, |clearpoke|,
            // |poke|
        ],
        ignoredUpToStart,
    );
    await startEvent(ctx);
}

/**
 * Optional `|init|battle` room initializer message.
 *
 * Note that this is optional because this isn't shown if the battle doesn't
 * take place in a PS battle room, e.g. when using the sim's battle stream lib.
 */
const initBattle = () =>
    unordered.parser<"gen4">(
        "init battle",
        async function initBattleImpl(ctx, accept) {
            const event = await tryVerify(ctx, "|init|");
            if (!event) return;
            accept();

            if (event.args[1] !== "battle") {
                throw new Error(
                    `Expected room type 'battle' but got '${event.args[1]}'`,
                );
            }
            await base["|init|"](ctx);
        },
    );

const gameType = () =>
    unordered.parser<"gen4">(
        "game type",
        async function gameTypeImpl(ctx, accept) {
            const event = await tryVerify(ctx, "|gametype|");
            if (!event) return;
            accept();

            if (event.args[1] !== "singles") {
                throw new Error(
                    `Expected game type 'singles' but got '${event.args[1]}'`,
                );
            }
            await base["|gametype|"](ctx);
        },
        () => {
            throw new Error("Expected |gametype|singles event");
        },
    );

const player = (num: 1 | 2) =>
    unordered.parser<"gen4">(
        `player ${num}`,
        async function playerImpl(ctx, accept) {
            const event = await tryVerify(ctx, "|player|");
            if (!event || event.args[1] !== (`p${num}` as const)) return;
            accept();

            if (ctx.state.username === event.args[2]) {
                [, ctx.state.ourSide] = event.args;
            }
            await base["|player|"](ctx);
        },
        () => {
            throw new Error(`Expected |player|p${num}| event`);
        },
    );

const request = () =>
    unordered.parser<"gen4">(
        "initial request",
        async function requestImpl(ctx, accept) {
            const event = await tryVerify(ctx, "|request|");
            if (!event) return;
            accept();

            // Only the first |request| msg can be used to initialize the
            // client's team.
            initRequest(ctx.state, Protocol.parseRequest(event.args[1]));
            await consume(ctx);
        },
        () => {
            throw new Error("Expected |request| event");
        },
    );

const teamSize = (num: 1 | 2) =>
    unordered.parser<"gen4">(
        `team size ${num}`,
        async function teamSizeImpl(ctx, accept) {
            const event = await tryVerify(ctx, "|teamsize|");
            if (!event || event.args[1] !== (`p${num}` as const)) return;
            accept();

            // Client's side should be initialized by the first |request| msg.
            const [, sideId, sizeStr] = event.args;
            if (ctx.state.ourSide !== sideId) {
                const size = Number(sizeStr);
                ctx.state.getTeam(sideId).size = size;
            }
            await base["|teamsize|"](ctx);
        },
        () => {
            throw new Error(`Expected |teamsize|p${num}| event`);
        },
    );

const gen = (num: GenerationNum) =>
    unordered.parser<"gen4">(`gen ${num}`, async function genImpl(ctx, accept) {
        const event = await tryVerify(ctx, "|gen|");
        if (!event) return;
        accept();

        const [, genNum] = event.args;
        if (num !== genNum) {
            throw new Error(`Expected gen ${num} but got ${genNum}`);
        }
        // TODO: Record gen?
        await base["|gen|"](ctx);
    });

const tier = () =>
    unordered.parser<"gen4">("tier", async function tierImpl(ctx, accept) {
        const event = await tryVerify(ctx, "|tier|");
        if (!event) return;
        accept();

        // TODO: Record tier?
        await base["|tier|"](ctx);
    });

const rules = () =>
    unordered.parser<"gen4">("rules", async function rulesImpl(ctx, accept) {
        let event = await tryVerify(ctx, "|rule|");
        if (!event) return;
        accept();
        do {
            // TODO: Record rules/mods?
            await base["|rule|"](ctx);
            event = await tryVerify(ctx, "|rule|");
        } while (event);
    });

/**
 * Initializes the client's side of the battle using an initial `|request|`
 * message JSON.
 */
function initRequest(state: BattleState, req: Protocol.Request) {
    if (!req.side) return;

    if (state.ourSide) {
        if (req.side.id !== state.ourSide) {
            throw new Error(
                `Expected |request| with side.id = '${state.ourSide}' but ` +
                    `got '${req.side.id}'`,
            );
        }
    } else state.ourSide = req.side.id;

    if (req.side.name !== state.username) {
        throw new Error(
            `Expected |request| with side.name = '${state.username}' but got ` +
                `'${req.side.name}'`,
        );
    }

    const team = state.getTeam(state.ourSide);
    team.size = req.side.pokemon.length;
    for (const reqMon of req.side.pokemon) {
        // Preprocess moves to possibly extract hiddenpower type and happiness.
        const moves: string[] = [];
        let happiness: number | undefined;
        let hpType: HpType | undefined;
        for (const moveId of reqMon.moves) {
            let id: string = moveId;
            ({id, happiness, hpType} = sanitizeMoveId(id));
            moves.push(id);
        }

        const revealOpts: TeamRevealOptions = {
            species: toIdName(reqMon.speciesForme),
            level: reqMon.level,
            gender: reqMon.gender ?? "N",
            hp: reqMon.hp,
            hpMax: reqMon.maxhp,
            moves,
        };
        const mon = team.reveal(revealOpts)!;

        mon.happiness = happiness ?? null;
        if (hpType) mon.hpType.narrow(hpType);

        mon.baseTraits.stats.hp.set(reqMon.maxhp);
        for (const stat in reqMon.stats) {
            // istanbul ignore if
            if (!Object.hasOwnProperty.call(reqMon.stats, stat)) continue;
            const id = stat as Exclude<StatID, "hp">;
            mon.baseTraits.stats[id].set(reqMon.stats[id]);
        }

        mon.baseTraits.ability.narrow(reqMon.baseAbility);
        mon.setItem(reqMon.item);
    }
}

/**
 * Parses a move id from a |request| JSON to extract the base name from the
 * additional features.
 */
export function sanitizeMoveId(id: string): {
    id: string;
    happiness?: number;
    hpType?: HpType;
    hpPower?: number;
} {
    id = toIdName(id);
    let happiness: number | undefined;
    let hpType: HpType | undefined;
    let hpPower: number | undefined;
    if (id.startsWith("hiddenpower") && id.length > "hiddenpower".length) {
        // Format: hiddenpower<type><base power if gen2-5>
        hpType = id.substr("hiddenpower".length).replace(/\d+/, "") as HpType;
        const hpPowerStr = id.match(/\d+/)?.[0];
        if (hpPowerStr) hpPower = Number(hpPowerStr);
        id = "hiddenpower";
    } else if (id.startsWith("return") && id.length > "return".length) {
        // Format: return<base power>
        // Equation: base power = happiness / 2.5
        happiness = 2.5 * parseInt(id.substr("return".length), 10);
        id = "return";
    } else if (
        id.startsWith("frustration") &&
        id.length > "frustration".length
    ) {
        // Format: frustration<base power>
        // Equation: base power = (255-happiness) / 2.5
        const scaled = 2.5 * parseInt(id.substr("frustration".length), 10);
        happiness = 255 - scaled;
        id = "frustration";
    }
    return {id, happiness, hpType, hpPower};
}

/**
 * Consumes all irrelevant events up to and including the final `|start` event.
 */
async function ignoredUpToStart(
    ctx: BattleParserContext<"gen4">,
    accept: () => void,
): Promise<void> {
    const event = await peek(ctx);
    switch (event.args[0]) {
        case "start":
            // Initialization phase ends on the |start event.
            // TODO: What about team preview?
            accept();
        // Fallthrough.
        case "init":
        case "gametype":
        case "player":
        case "request":
        case "teamsize":
        case "gen":
        case "tier":
        case "rule":
            break;
        case "rated":
        case "seed":
        case "split":
        case "teampreview":
        case "clearpoke":
        case "poke":
        default: {
            // Handle.consume event but don't accept it so the parser can be
            // called again later to consume another irrelevant event.
            const key = Protocol.key(event.args);
            if (key && Object.hasOwnProperty.call(base, key)) {
                await base[key](ctx);
            } else await consume(ctx);
        }
    }
}

/** Handles the initial `|start` event to start the battle. */
async function startEvent(ctx: BattleParserContext<"gen4">) {
    await verify(ctx, "|start|");
    await consume(ctx);
}
