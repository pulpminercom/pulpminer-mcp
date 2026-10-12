import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "../../src/server.js";

const BASE_URL = "https://api.pulpminer.com";
const TIMEOUT_MS = 300_000;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// The caller's PulpMiner API key, from `Authorization: Bearer <key>` or the
// `x-pulpminer-api-key` / `apikey` headers. Never stored server-side.
const apiKeyFrom = (req: Request) =>
	req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ||
	req.headers.get("x-pulpminer-api-key")?.trim() ||
	req.headers.get("apikey")?.trim() ||
	undefined;

// Static server card for Smithery (SEP-1649), built from the same tool
// definitions the server registers, by listing them over an in-memory link.
let serverCard: Promise<unknown> | undefined;
const buildServerCard = async () => {
	const server = createServer({ baseUrl: BASE_URL, apiKey: undefined, timeoutMs: TIMEOUT_MS });
	const client = new Client({ name: "server-card", version: SERVER_VERSION });
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
	const { tools } = await client.listTools();
	await client.close();
	return {
		serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
		authentication: {
			required: true,
			schemes: ["bearer"],
			description:
				"Your PulpMiner API key (dashboard > API Keys), sent as `Authorization: Bearer <key>` or the `x-pulpminer-api-key` header.",
		},
		tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
		resources: [],
		prompts: [],
	};
};

export default {
	async fetch(req: Request): Promise<Response> {
		const { pathname } = new URL(req.url);
		if (pathname === "/health") return json(200, { ok: true });
		if (pathname === "/.well-known/mcp/server-card.json" && (req.method === "GET" || req.method === "HEAD")) {
			serverCard ??= buildServerCard().catch((err) => {
				serverCard = undefined;
				throw err;
			});
			return json(200, await serverCard, { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" });
		}
		if (pathname !== "/mcp") return new Response("Not found", { status: 404 });
		if (req.method !== "POST") {
			// Stateless: no standalone SSE stream or session deletion.
			return json(405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { Allow: "POST" });
		}

		const server = createServer({ baseUrl: BASE_URL, apiKey: apiKeyFrom(req), timeoutMs: TIMEOUT_MS });
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		await server.connect(transport);
		return transport.handleRequest(req);
	},
};
