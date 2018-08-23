import { Message, Packet } from "./Message";
import { PokemonID, PokemonDetails, PokemonStatus } from "./Pokemon";

export class MessageParser
{
    private readonly message: string;
    /** Position within the string. */
    private pos: number;

    constructor(message: string)
    {
        this.message = message;
    }

    /**
     * Parses the message sent from the server. This is split into lines and
     * parsed separately as little sub-messages.
     * @returns A Packet containing all the Messages that were parsed.
     */
    public parse(): Packet
    {
        const result: Packet =
        {
            room: null,
            messages: []
        };

        // start with parsing the room name if possible
        // format: >roomname
        if (this.message.startsWith(">"))
        {
            this.pos = this.message.indexOf("\n", 1);
            if (this.pos !== -1)
            {
                result.room = this.message.substring(1, this.pos);
            }
        }
        else
        {
            this.pos = 0;
        }

        // parse all messages on each line
        while (this.pos >= 0 && this.pos < this.message.length)
        {
            const message = this.parseMessage();
            // filter out nulls
            if (message)
            {
                result.messages.push(message);
            }
            // advance to the next line
            this.pos = this.message.indexOf("\n", this.pos);
            if (this.pos !== -1)
            {
                ++this.pos;
            }
        }
        return result;
    }

    /**
     * Parses a single message line.
     * @returns A parsed Message, or null if it's either invalid or unimportant.
     */
    private parseMessage(): Message | null
    {
        let result: Message | null = null;
        const prefix = this.getWord();
        if (prefix)
        {
            switch (prefix)
            {
                // taken from PROTOCOL.md in github.com/Zarel/Pokemon-Showdown

                // room initialization
                case "init": // joined a room
                    // format: |init|<chat or battle>
                    const word = this.getWord();
                    if (word === "chat" || word === "battle")
                    {
                        result =
                        {
                            prefix: "init",
                            type: word
                        };
                    }
                    break;
                case "title":
                case "users":
                    break;

                // room messages
                case "":
                case "html":
                case "uhtml":
                case "uhtmlchange":
                case "join": case "j": case "J":
                case "leave": case "l": case "L":
                case "chat": case "c": case "C":
                case ":":
                case "c:":
                case "battle": case "b": case "B":
                    break;

                // global messages
                case "popup":
                case "pm":
                case "usercount":
                case "nametaken":
                    break;

                case "challstr": // login key
                    // format: |challstr|<id>|<really long challstr>
                    result =
                    {
                        prefix: "challstr",
                        challstr: this.getRestOfLine()
                    };
                    break;
                case "updateuser": // user info changed
                    // format: |updateuser|<username>|<0 if guest, 1 otherwise>|
                    //  <avatar id>
                    result =
                    {
                        prefix: "updateuser",
                        username: this.getWord() || "",
                        isGuest: !parseInt(this.getWord() || "0")
                    };
                    break;
                case "formats":
                case "updatesearch":
                    break;
                case "updatechallenges":
                    // change in incoming/outgoing challenges
                    // format: |updatechallenges|<json>
                    // json contains challengesFrom and challengeTo
                    const challenges = JSON.parse(this.getRestOfLine());
                    result =
                    {
                        prefix: "updatechallenges",
                        challengesFrom: challenges["challengesFrom"]
                    };
                    break;
                case "queryresponse":

                // battle initialization
                case "player":
                case "gametype":
                case "gen":
                case "tier":
                case "rated":
                case "rule":
                case "clearpoke":
                case "poke":
                case "teampreview":
                case "start":
                    break;

                // battle progress
                case "request": // move/switch request
                    // format: |request|<json>
                    // json contains active and side pokemon info
                    result =
                    {
                        prefix: "request",
                        team: JSON.parse(this.getRestOfLine())
                    };
                    break;
                case "inactive":
                case "inactiveoff":
                    break;
                case "turn": // update turn counter
                    // format: |turn|<turn number>
                    result =
                    {
                        prefix: "turn",
                        turn: parseInt(this.getRestOfLine())
                    };
                    break;
                case "win":
                case "tie":
                    break;

                // major actions
                case "move": // a pokemon performed a move
                    break;
                case "switch": // a pokemon was voluntarily switched
                case "drag": // involuntarily switched, really doesn't matter
                    // format: |<switch or drag>|<pokemon>|<details>|<status>
                    // pokemon contains active position and nickname
                    // details contains species, gender, etc.
                    // status contains hp (value or %), status, etc.

                    const pokemon = this.getWord();
                    let pokemonId: PokemonID | null;
                    if (!pokemon || !(pokemonId = this.parsePokemonID(pokemon)))
                    {
                        break;
                    }

                    const unparsedDetails = this.getWord();
                    let details: PokemonDetails | null;
                    if (!unparsedDetails ||
                        !(details = this.parsePokemonDetails(unparsedDetails)))
                    {
                        break;
                    }

                    const unparsedStatus = this.getWord();
                    let status: PokemonStatus | null;
                    if (!unparsedStatus ||
                        !(status = this.parsePokemonStatus(unparsedStatus)))
                    {
                        break;
                    }

                    result =
                    {
                        prefix: "switch",
                        id: pokemonId,
                        details: details,
                        status: status
                    };
                    break;
                case "detailschange":
                case "-formechange":
                case "replace":
                case "swap":
                case "cant":
                case "faint":
                    break;

                // minor actions
                case "-fail":
                case "-damage":
                case "-heal":
                case "-status":
                case "-curestatus":
                case "-cureteam":
                case "-boost":
                case "-unboost":
                case "-weather":
                case "-fieldstart":
                case "-fieldend":
                case "-sidestart":
                case "-sideend":
                case "-crit":
                case "-supereffective":
                case "-resisted":
                case "-immune":
                case "-item":
                case "-enditem":
                case "-ability":
                case "-endability":
                case "-transform":
                case "-mega":
                case "-activate":
                case "-hint":
                case "-center":
                case "-message":
                    break;
            }
        }
        return result;
    }

    /**
     * Parses a Pokemon ID in the form `<position>: <name>`. Position is in the
     * format `<owner><pos>`, where owner determines who's side the pokemon is
     * on and pos is its position on that side (applicable in non-single
     * battles). Name is just the Pokemon's nickname.
     * @param id 
     */
    private parsePokemonID(id: string): PokemonID | null
    {
        const i = id.indexOf(":");
        if (i !== -1)
        {
            const owner = id.substring(0, i - 1);
            const position = id.substring(i - 1, i);
            const nickname = id.substring(i);
            return { owner: owner, position: position, nickname: nickname };
        }
        else
        {
            return null;
        }
    }

    private parsePokemonDetails(details: string): PokemonDetails | null
    {
        const words = details.split(", ");
        if (words.length > 0)
        {
            const species = words[0];
            let shiny: boolean;
            let gender: string | null;
            let level: number;
            let i = 1;

            if (words[i] === "shiny")
            {
                shiny = true;
                ++i;
            }
            else
            {
                shiny = false;
            }

            if (words[i] === "M" || details[i] === "F")
            {
                gender = words[i];
                ++i;
            }
            else
            {
                gender = null;
            }

            // level is always 100 unless otherwise indicated
            level = words[i].startsWith("L") ?
                parseInt(words[i].substring(1)) : 100;

            return { species: species, shiny: shiny, gender: gender,
                level: level };
        }
        return null;
    }

    private parsePokemonStatus(status: string): PokemonStatus | null
    {
        const slash = status.indexOf("/");
        if (slash === -1) return null;
        let space = status.indexOf(" ", slash);
        // status condition can be omitted, in which case it'll end up as an
        //  empty string
        if (space === -1) space = status.length;

        const hp = parseInt(status.substring(0, slash));
        const hpMax = parseInt(status.substring(slash, space));
        const condition = status.substring(space + 1);
        return { hp: hp, hpMax: hpMax, condition: condition };
    }

    /**
     * Gets the next phrase which is surrounded by `|` symbols. The last
     * character can optionally have a newline at the end. `pos` should be
     * pointed to the first `|` and will end up on the next `|` or newline, or
     * the end of the string if it encountered the end of the string.
     * @returns The message prefix, or null if the pipe character was missing.
     */
    private getWord(): string | null
    {
        if (this.message.charAt(this.pos) !== "|")
        {
            // no pipe at beginning
            return null;
        }

        // build up the prefix substring
        let result = "";
        while (++this.pos < this.message.length)
        {
            const c = this.message.charAt(this.pos);
            if (c === "|" || c === "\n")
            {
                return result;
            }
            else
            {
                result += c;
            }
        }
        return result;
    }

    /**
     * Advances `pos` to the end of the line and returns a substring from the
     * original to the new position.
     * @returns The rest of the line from `pos` forward.
     */
    private getRestOfLine(): string
    {
        const start = this.pos;
        this.pos = this.message.indexOf("\n", this.pos);
        return this.message.substring(start, this.pos);
    }
}
