import {createServer, Server} from "http";
import * as url from "url";
import {
    connection as WSConnection,
    Message,
    server as WSServer,
} from "websocket";

/** Mocks the server's http and websocket APIs for PSBot testing. */
export class MockPsServer {
    /** Whether this server is connected to a client. */
    public get isConnected(): boolean {
        return this.connection?.connected ?? false;
    }

    /** Query string from the last HTTP request. */
    public get lastQuery(): url.URLSearchParams | null {
        return this._lastQuery;
    }
    private _lastQuery: url.URLSearchParams | null = null;

    /** Username required for login. */
    public username = "";
    /** Password required for login. */
    public password?: string;

    /** Assertion string used for login testing. */
    private readonly assertion: string;
    /** HTTP server. */
    private readonly http: Server;
    /** Websocket server. */
    private readonly ws: WSServer;
    /** Current connection from server to client. */
    private connection?: WSConnection;

    /**
     * Creates a MockPSServer.
     *
     * @param assertion Assertion string used for login testing.
     * @param port Port to listen to. Default 8000.
     */
    public constructor(assertion: string, port = 8000) {
        this.assertion = assertion;

        this.http = createServer((req, res) => {
            if (req.url !== "/~~showdown/action.php") {
                res.writeHead(404);
                res.end();
                return;
            }
            let body = "";
            req.on("data", chunk => (body += `${chunk}`));
            req.on("end", () => {
                this._lastQuery = new url.URLSearchParams(body);
                switch (this._lastQuery.get("act")) {
                    case "getassertion":
                        if (this.password) {
                            res.end(";");
                        } else {
                            res.end(this.assertion);
                        }
                        break;
                    case "login":
                        if (
                            this.username === this._lastQuery.get("name") &&
                            this.password === this._lastQuery.get("pass")
                        ) {
                            res.end(
                                `]{"actionsuccess":true,` +
                                    `"assertion":"${this.assertion}"}`,
                            );
                        } else {
                            res.end(
                                `]{"actionsuccess":false,` + `"assertion":";"}`,
                            );
                        }
                        break;
                    default:
                        res.writeHead(404);
                        res.end();
                }
            });
        });
        this.http.listen(port);

        this.ws = new WSServer({httpServer: this.http});
        this.ws.on("request", req => {
            if (req.httpRequest.url === "/showdown/websocket") {
                this.connection = req.accept();
            }
        });
    }

    /** Promise to get the next message from the current connection. */
    public async nextMessage(): Promise<Message> {
        return await new Promise((res, rej) => {
            if (!this.connection?.connected) {
                return rej(new Error("Not connected to client"));
            }
            this.connection.once("message", res);
        });
    }

    /** Sends a message to the client. */
    public sendToClient(message: string): void {
        if (!this.connection?.connected) {
            throw new Error("Not connected to client");
        }
        this.connection.sendUTF(message);
    }

    /** Disconnects from current client. */
    public disconnect(): void {
        if (!this.connection) {
            return;
        }

        this.connection.removeAllListeners();
        this.connection.close();
        this.connection = undefined;

        // Reset other public properties
        this._lastQuery = null;
    }

    /** Shuts down server. */
    public shutdown(): void {
        this.disconnect();

        if (this.http) {
            this.http.close();
        }

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.shutDown();
        }
    }
}
