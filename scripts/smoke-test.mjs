// Smoke test: starts a mock PulpMiner API on localhost, runs the MCP server over stdio
// and Streamable HTTP, lists tools, validates schemas and checks the exact requests sent.
// No calls are made to the real PulpMiner API.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const calls = [];
const saved = [];
const mock = createServer(async (req, res) => {
	let body = "";
	for await (const c of req) body += c;
	const url = new URL(req.url, "http://x");
	calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: body ? JSON.parse(body) : undefined });
	const send = (status, obj) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(obj));
	const p = url.pathname;
	if (p === "/external/ai/json" && req.headers.apikey === "broke") return send(402, { data: null, errors: [{ message: "No credits left ⚠. Please buy more credits" }] });
	if (p.startsWith("/external/ai/json") && req.headers.apikey === "old") return send(404, { data: null, errors: [{ message: "not found" }] });
	if (p === "/external/ai/json" && req.method === "POST") return send(200, { data: { json: { title: "Hello" } }, errors: null });
	if (p === "/external/ai/json/save" && req.method === "POST") {
		const b = JSON.parse(body);
		saved.unshift({ id: 42 + saved.length, url: b.url, dynamic: b.dynamic === "true" ? 1 : 0, dynamicUrl: b.dynamicURL });
		return send(200, { data: [], errors: null });
	}
	if (p === "/external/n8n/auth") return req.headers.apikey === "good" ? send(200, { data: null, errors: null }) : send(404, { data: null, errors: null });
	if (p === "/external/api/url") return send(200, { data: [{ id: 7, url: "https://a.com", dynamic: 1, dynamicUrl: "https://a.com/?q={{ q }}" }, ...[...saved].reverse()], errors: null });
	if (p === "/external/7" && req.method === "GET") return send(400, { data: null, errors: [{ message: "request is invalid" }] });
	if (p === "/external/7" && req.method === "POST") return send(200, { data: { results: [1, 2] }, errors: null });
	if (p === "/external/8") return send(200, { data: { ok: true }, errors: null });
	if (p === "/external/9") return send(401, { data: null, errors: [{ message: "invalid key" }] });
	send(404, { data: null, errors: [{ message: "not found" }] });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${mock.address().port}`;
const env = { ...process.env, PULPMINER_BASE_URL: base, PULPMINER_API_KEY: "good" };

const text = (r) => r.content.map((c) => c.text).join("\n");
const results = [];
const check = async (name, fn) => {
	try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
};

const EXPECTED = ["pulpminer_check_api_key", "pulpminer_fetch_api_data", "pulpminer_generate_json", "pulpminer_list_saved_apis", "pulpminer_save_as_api"];

async function exercise(client, label) {
	await check(`${label}: listTools`, async () => {
		const { tools } = await client.listTools();
		assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED);
		for (const t of tools) {
			assert.equal(t.inputSchema.type, "object", `${t.name} schema type`);
			assert.ok(t.description && t.description.length > 40, `${t.name} description`);
		}
		const gen = tools.find((t) => t.name === "pulpminer_generate_json");
		assert.deepEqual(gen.inputSchema.required, ["url"]);
		assert.deepEqual(gen.inputSchema.properties.llm.enum, ["llm_1", "llm_2", "llm_3"]);
		const save = tools.find((t) => t.name === "pulpminer_save_as_api");
		assert.deepEqual(save.inputSchema.required.sort(), ["jsonFormat", "url"]);
	});

	await check(`${label}: generate_json request shape`, async () => {
		calls.length = 0;
		const r = await client.callTool({ name: "pulpminer_generate_json", arguments: { url: "https://example.com", jsonFormat: { title: "" }, extraLLMInfo: "x" } });
		assert.ok(!r.isError, text(r));
		assert.match(text(r), /Hello/);
		const c = calls[0];
		assert.equal(c.path, "/external/ai/json");
		assert.equal(c.headers.apikey, "good");
		assert.equal(c.headers.authorization, undefined);
		assert.deepEqual(c.body, { url: "https://example.com", scraper: "scraper_1", llm: "llm_2", renderJs: "on", jsonFormat: '{"title":""}', extraLLMInfo: "x" });
	});

	await check(`${label}: save_as_api request shape + id lookup`, async () => {
		calls.length = 0;
		const r = await client.callTool({ name: "pulpminer_save_as_api", arguments: { url: "https://example.com/s?q=a", jsonFormat: { title: "" }, cache: true, dynamicUrl: "https://example.com/s?q={{ q }}" } });
		assert.ok(!r.isError, text(r));
		const out = JSON.parse(text(r).split("\n\n").slice(1).join("\n\n"));
		assert.equal(out.endpoint, `${base}/external/${out.apiId}`);
		assert.equal(out.method, "POST");
		assert.deepEqual(out.variables, ["q"]);
		assert.deepEqual(calls[0].body, { url: "https://example.com/s?q=a", jsonFormat: '{"title":""}', dynamic: "true", dynamicURL: "https://example.com/s?q={{ q }}", renderJs: "true", useSession: "false", cache: "on", scraper: "scraper_1", llm: "llm_2", selector: "body", extraLLMInfo: "" });
	});

	await check(`${label}: save_as_api rejects empty template var`, async () => {
		const r = await client.callTool({ name: "pulpminer_save_as_api", arguments: { url: "https://e.com", jsonFormat: { a: 1 }, dynamicUrl: "https://e.com/{{ }}" } });
		assert.ok(r.isError);
	});

	await check(`${label}: fetch static / dynamic`, async () => {
		calls.length = 0;
		let r = await client.callTool({ name: "pulpminer_fetch_api_data", arguments: { apiId: 8 } });
		assert.ok(!r.isError, text(r));
		assert.equal(calls[0].method, "GET");
		assert.equal(calls[0].headers.apikey, "good");
		r = await client.callTool({ name: "pulpminer_fetch_api_data", arguments: { apiId: "7", variables: { q: "x" } } });
		assert.ok(!r.isError, text(r));
		assert.deepEqual(calls[1].body, { q: "x" });
		r = await client.callTool({ name: "pulpminer_fetch_api_data", arguments: { apiId: "7" } });
		assert.ok(r.isError && /pass 'variables'/.test(text(r)), text(r));
		r = await client.callTool({ name: "pulpminer_fetch_api_data", arguments: { apiId: 9 } });
		assert.ok(r.isError && /no saved API with id 9/.test(text(r)), text(r));
	});

	await check(`${label}: list / config / check key`, async () => {
		let r = await client.callTool({ name: "pulpminer_list_saved_apis", arguments: {} });
		assert.deepEqual(JSON.parse(text(r))[0].variables, ["q"]);
		assert.deepEqual(calls.at(-1).query, { page: "1", pageSize: "50" });
		r = await client.callTool({ name: "pulpminer_check_api_key", arguments: {} });
		assert.equal(JSON.parse(text(r)).apiKeyValid, true);
	});

	await check(`${label}: schema validation rejects bad input`, async () => {
		const r = await client.callTool({ name: "pulpminer_generate_json", arguments: { url: "not-a-url" } }).catch((e) => ({ isError: true, content: [{ text: e.message }] }));
		assert.ok(r.isError);
	});
}

// stdio
{
	const client = new Client({ name: "smoke", version: "0" });
	await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env, stderr: "ignore" }));
	await exercise(client, "stdio");
	await client.close();
}
// missing credentials
{
	const client = new Client({ name: "smoke", version: "0" });
	const { PULPMINER_API_KEY, ...noCreds } = env;
	await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: noCreds, stderr: "ignore" }));
	await check("no-creds: helpful errors", async () => {
		let r = await client.callTool({ name: "pulpminer_generate_json", arguments: { url: "https://e.com" } });
		assert.ok(r.isError && /PULPMINER_API_KEY/.test(text(r)), text(r));
		r = await client.callTool({ name: "pulpminer_fetch_api_data", arguments: { apiId: 1 } });
		assert.ok(r.isError && /PULPMINER_API_KEY/.test(text(r)), text(r));
		assert.ok(!/Network error/.test(text(r)), text(r));
	});
	await client.close();
}
// Older backend without the API-key generation routes: clear 404 message
{
	const client = new Client({ name: "smoke", version: "0" });
	await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...env, PULPMINER_API_KEY: "old" }, stderr: "ignore" }));
	await check("backend without API-key generation routes", async () => {
		const r = await client.callTool({ name: "pulpminer_generate_json", arguments: { url: "https://p.com" } });
		assert.ok(r.isError && /does not accept API keys/.test(text(r)), text(r));
	});
	await client.close();
}
// Out of credits: 402 is surfaced with a buy-credits hint
{
	const client = new Client({ name: "smoke", version: "0" });
	await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...env, PULPMINER_API_KEY: "broke" }, stderr: "ignore" }));
	await check("402 out of credits", async () => {
		const r = await client.callTool({ name: "pulpminer_generate_json", arguments: { url: "https://p.com" } });
		assert.ok(r.isError && /402: No credits left/.test(text(r)) && /pulpminer\.com\/credits/.test(text(r)), text(r));
	});
	await client.close();
}
// Streamable HTTP, credentials supplied per request via headers
{
	const port = 34000 + Math.floor(Math.random() * 1000);
	const { PULPMINER_API_KEY, ...noCreds } = env;
	const proc = spawn("node", ["dist/index.js", "--http"], { env: { ...noCreds, PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
	await new Promise((r) => proc.stderr.on("data", (d) => /listening/.test(d) && r()));
	const client = new Client({ name: "smoke", version: "0" });
	await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { "x-pulpminer-api-key": "good" } } }));
	await exercise(client, "http");
	await client.close();
	proc.kill();
}

mock.close();
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
