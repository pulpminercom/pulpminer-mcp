#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const args = process.argv.slice(2);
const useHttp = args.includes("--http") || process.env.MCP_TRANSPORT === "http";

if (args.includes("--help") || args.includes("-h")) {
	console.log(`${SERVER_NAME}-mcp ${SERVER_VERSION}

Usage: pulpminer-mcp [--http]

  (default)   stdio transport, for Cursor / Claude Desktop / other local MCP clients
  --http      Streamable HTTP transport on http://$HOST:$PORT/mcp (default 127.0.0.1:3333)

Env: PULPMINER_API_KEY, PULPMINER_BASE_URL, PULPMINER_TIMEOUT_MS, PORT, HOST
In HTTP mode a client may override the API key per request with the
x-pulpminer-api-key header.`);
	process.exit(0);
}

const baseConfig = loadConfig();

const runStdio = async () => {
	const server = createServer(baseConfig);
	await server.connect(new StdioServerTransport());
	console.error(`${SERVER_NAME} MCP server ${SERVER_VERSION} running on stdio`);
};

const runHttp = async () => {
	const port = Number(process.env.PORT ?? 3333);
	const host = process.env.HOST ?? "127.0.0.1";

	const httpServer = createHttpServer(async (req, res) => {
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
			return;
		}
		if (url.pathname !== "/mcp") {
			res.writeHead(404).end("Not found");
			return;
		}
		if (req.method !== "POST") {
			// Stateless server: no standalone SSE stream / session deletion.
			res
				.writeHead(405, { "Content-Type": "application/json", Allow: "POST" })
				.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }));
			return;
		}

		const header = (name: string) => {
			const v = req.headers[name];
			return Array.isArray(v) ? v[0] : v;
		};
		const config = {
			...baseConfig,
			apiKey: header("x-pulpminer-api-key")?.trim() || baseConfig.apiKey,
		};

		// Stateless mode: a fresh server + transport per request.
		const server = createServer(config);
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		res.on("close", () => {
			transport.close();
			server.close();
		});
		try {
			await server.connect(transport);
			await transport.handleRequest(req, res);
		} catch (err) {
			console.error("Error handling MCP request:", err);
			if (!res.headersSent) {
				res
					.writeHead(500, { "Content-Type": "application/json" })
					.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
			}
		}
	});

	httpServer.listen(port, host, () => {
		console.error(`${SERVER_NAME} MCP server ${SERVER_VERSION} listening on http://${host}:${port}/mcp`);
	});
};

(useHttp ? runHttp() : runStdio()).catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
