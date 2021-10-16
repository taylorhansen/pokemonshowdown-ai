import { createServer, Server } from "http";
import * as querystring from "querystring";
import * as url from "url";
import { connection as WSConnection, IMessage, server as WSServer } from
    "websocket";

/** Mocks the server's http and websocket APIs for PSBot testing. */
export class MockPSServer
{
    /** Whether this server is connected to a client. */
    public get isConnected(): boolean
    {
        return this.connection?.connected ?? false;
    }

    /** Query string from the last HTTP request. */
    public get lastQuery(): querystring.ParsedUrlQuery
    {
        return this._lastQuery;
    }
    private _lastQuery: querystring.ParsedUrlQuery = {};

    /** Username required for login. */
    public username = "";
    /** Password required for login. */
    public password?: string;

    /** Assertion string used for login testing. */
    private assertion: string;
    /** HTTP server. */
    private http?: Server;
    /** Websocket server. */
    private ws?: WSServer;
    /** Current connection from server to client. */
    private connection?: WSConnection;

    /**
     * Creates a MockPSServer.
     * @param assertion Assertion string used for login testing.
     * @param port Port to listen to. Default 8000.
     */
    constructor(assertion: string, port = 8000)
    {
        this.assertion = assertion;
        this.init(port);
    }

    /**
     * Initializes the server to listen to the specified port. Called
     * automatically by constructor.
     */
    public init(port: number): void
    {
        this.http = createServer((req, res) =>
        {
            const parsedUrl = url.parse(req.url || "");
            if (parsedUrl.pathname === "/~~showdown/action.php")
            {
                let body = "";
                req.on("data", chunk => body += chunk);
                req.on("end", () =>
                {
                    this._lastQuery = querystring.parse(body);
                    switch (this._lastQuery.act)
                    {
                        case "getassertion":
                            if (this.password) res.end(";");
                            else res.end(this.assertion);
                            break;
                        case "login":
                            if (this.username === this._lastQuery.name &&
                                this.password === this._lastQuery.pass)
                            {
                                res.end(`]{"actionsuccess":true,` +
                                    `"assertion":"${this.assertion}"}`);
                            }
                            else
                            {
                                res.end(`]{"actionsuccess":false,` +
                                    `"assertion":";"}`);
                            }
                            break;
                        default:
                            res.writeHead(404);
                            res.end();
                    }
                });
            }
            else
            {
                res.writeHead(404);
                res.end();
            }
        });
        this.http.listen(port);

        this.ws = new WSServer({httpServer: this.http});
        this.ws.on("request", req =>
        {
            if (req.httpRequest.url === "/showdown/websocket")
            {
                this.connection = req.accept();
            }
        });
    }

    /** Promise to get the next message from the current connection. */
    public nextMessage(): Promise<IMessage>
    {
        return new Promise(res =>
        {
            if (!this.connection?.connected)
            {
                throw new Error("Not connected to client");
            }
            this.connection.once("message", res);
        });
    }

    /** Sends a message to the client. */
    public sendToClient(message: string): void
    {
        if (!this.connection?.connected)
        {
            throw new Error("Not connected to client");
        }
        this.connection.sendUTF(message);
    }

    /** Disconnects from current client. */
    public disconnect(): void
    {
        if (!this.connection) return;

        this.connection.removeAllListeners();
        this.connection.close();
        this.connection = undefined;

        // reset other public properties
        this._lastQuery = {};
    }

    /** Shuts down server. */
    public shutdown(): void
    {
        this.disconnect();

        if (this.http)
        {
            this.http.close();
            this.http = undefined;
        }

        if (this.ws)
        {
            this.ws.removeAllListeners();
            this.ws.shutDown();
            this.ws = undefined;
        }
    }
}
