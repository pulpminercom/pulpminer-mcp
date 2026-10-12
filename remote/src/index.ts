import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../../src/server.js";

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

export default {
	async fetch(req: Request): Promise<Response> {
		const { pathname } = new URL(req.url);
		if (pathname === "/health") return json(200, { ok: true });
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
