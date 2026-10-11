import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PulpMinerClient, PulpMinerError } from "./client.js";
import type { PulpMinerConfig } from "./config.js";

export const SERVER_NAME = "pulpminer";
export const SERVER_VERSION = "0.1.0";

/*
 * Option values accepted by the PulpMiner API:
 *   scraper: scraper_1 | scraper_2
 *   llm:     llm_1 = Google Gemini, llm_2 = OpenAI GPT, llm_3 = Groq (only if enabled on the account)
 */
const scraperSchema = z
	.enum(["scraper_1", "scraper_2"])
	.default("scraper_1")
	.describe(
		"Scraper backend. scraper_1 (default, supports useSession) or scraper_2. Try the other one if a site blocks scraping.",
	);
const llmSchema = z
	.enum(["llm_1", "llm_2", "llm_3"])
	.default("llm_2")
	.describe(
		"LLM used to convert HTML to JSON. llm_2 = OpenAI GPT (default), llm_1 = Google Gemini, llm_3 = Groq (only if enabled for the account; otherwise the API returns 'bad request').",
	);
const jsonFormatSchema = z
	.record(z.string(), z.unknown())
	.describe(
		'Sample JSON whose keys define the output shape, e.g. {"title": "", "price": "", "items": [{"name": ""}]}. Key names are kept exactly; values are extracted from the page.',
	);
const commonScrapeShape = {
	url: z.string().url().describe("Full URL of the web page to extract data from (http/https)."),
	renderJs: z
		.boolean()
		.default(true)
		.describe("Render JavaScript in a headless browser before extracting (default true; adds 0.1 credits)."),
	useSession: z
		.boolean()
		.default(false)
		.describe("Use a persistent scraping session (scraper_1 only; ignored for lifetime-plan accounts)."),
	scraper: scraperSchema,
	llm: llmSchema,
	selector: z
		.string()
		.optional()
		.describe('CSS selector to limit extraction to part of the page, e.g. "main" or "#results". Default: whole body.'),
	extraLLMInfo: z
		.string()
		.optional()
		.describe("Extra natural-language instructions for the LLM, e.g. 'only the first 10 products, prices as numbers'."),
};

const ok = (data: unknown, note?: string): CallToolResult => ({
	content: [
		{
			type: "text",
			text: (note ? `${note}\n\n` : "") + JSON.stringify(data, null, 2),
		},
	],
});

const fail = (err: unknown): CallToolResult => ({
	isError: true,
	content: [
		{
			type: "text",
			text:
				err instanceof PulpMinerError || err instanceof Error
					? err.message
					: `Unexpected error: ${String(err)}`,
		},
	],
});

const extractTemplateVars = (template: string) =>
	[...template.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1].trim());

export const createServer = (config: PulpMinerConfig) => {
	const client = new PulpMinerClient(config);
	const server = new McpServer(
		{ name: SERVER_NAME, version: SERVER_VERSION },
		{
			instructions:
				"PulpMiner turns any web page into structured JSON using AI, and can save that configuration as a reusable REST API. Typical flow: pulpminer_generate_json to preview the JSON for a URL (optionally with a jsonFormat sample) -> pulpminer_save_as_api with the jsonFormat you are happy with -> pulpminer_fetch_api_data with the returned API id. Generation and API fetches consume PulpMiner credits.",
		},
	);

	// 1. AI JSON generation ---------------------------------------------------
	server.registerTool(
		"pulpminer_generate_json",
		{
			title: "Generate JSON from a web page with AI",
			description:
				"Scrape a web page and convert it to structured JSON with an LLM (PulpMiner POST /api/ai/json). Pass jsonFormat to force an exact output shape; omit it to let the AI infer a flat JSON. Does not save anything. Costs 0.25 credits (+0.1 with renderJs). Can take 10-60s+. Auth: PULPMINER_SESSION_TOKEN, or PULPMINER_API_KEY once the backend exposes /external/ai/json.",
			inputSchema: {
				...commonScrapeShape,
				jsonFormat: jsonFormatSchema.optional(),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async (args) => {
			try {
				const json = await client.generateJson({
					url: args.url,
					scraper: args.scraper,
					llm: args.llm,
					// backend expects the HTML-checkbox value "on" or the field absent
					renderJs: args.renderJs ? "on" : undefined,
					useSession: args.useSession ? "on" : undefined,
					jsonFormat:
						args.jsonFormat && Object.keys(args.jsonFormat).length
							? JSON.stringify(args.jsonFormat)
							: undefined,
					selector: args.selector,
					extraLLMInfo: args.extraLLMInfo,
				});
				return ok(json);
			} catch (err) {
				return fail(err);
			}
		},
	);

	// 2. Save as API -----------------------------------------------------------
	server.registerTool(
		"pulpminer_save_as_api",
		{
			title: "Save a page-to-JSON config as a reusable API",
			description:
				"Save a URL + JSON format as a PulpMiner API (POST /api/ai/json/save). Afterwards the data is available at {baseUrl}/external/{apiId} with the `apikey` header (see pulpminer_fetch_api_data). For a dynamic API, pass dynamicUrl with {{ variable }} placeholders, e.g. https://site.com/search?q={{ query }}; callers then supply those variables. Saving itself is free; each later fetch costs 0.4 credits (+0.1 with renderJs). Auth: PULPMINER_SESSION_TOKEN, or PULPMINER_API_KEY once the backend exposes /external/ai/json/save.",
			inputSchema: {
				...commonScrapeShape,
				url: z
					.string()
					.url()
					.describe("Page URL the API scrapes (for dynamic APIs: an example URL with real values)."),
				jsonFormat: jsonFormatSchema.describe(
					"Required. The JSON shape the API should return, usually the output of pulpminer_generate_json (values can be left as examples).",
				),
				cache: z
					.boolean()
					.default(false)
					.describe("Cache results: serve cached JSON (24h TTL) and refresh in the background when older than 15 min."),
				dynamicUrl: z
					.string()
					.optional()
					.describe("Optional URL template with {{ variable }} placeholders. When set the API becomes dynamic and must be called with variables."),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async (args) => {
			try {
				if (!Object.keys(args.jsonFormat).length) {
					throw new PulpMinerError("jsonFormat must contain at least one key.");
				}
				const dynamicUrl = args.dynamicUrl?.trim() || undefined;
				if (dynamicUrl) {
					const vars = extractTemplateVars(dynamicUrl);
					if (!vars.length)
						throw new PulpMinerError("dynamicUrl must contain at least one {{ variable }} placeholder.");
					if (vars.some((v) => v === ""))
						throw new PulpMinerError("dynamicUrl cannot contain empty {{ }} variables.");
				}
				await client.saveAiJson({
					url: args.url,
					jsonFormat: JSON.stringify(args.jsonFormat),
					dynamic: dynamicUrl ? "true" : "false",
					dynamicURL: dynamicUrl ?? "",
					renderJs: args.renderJs ? "true" : "false",
					useSession: args.useSession ? "true" : "false",
					cache: args.cache ? "on" : undefined,
					scraper: args.scraper,
					llm: args.llm,
					selector: args.selector ?? "body",
					extraLLMInfo: args.extraLLMInfo ?? "",
				});

				// The save endpoint returns `data: []` (INSERT without RETURNING), so look up the new id.
				let apiId: string | number | undefined;
				try {
					apiId = await client.findNewestSavedApi(args.url, dynamicUrl);
				} catch {
					/* best effort */
				}
				return ok(
					{
						saved: true,
						apiId: apiId ?? null,
						endpoint: apiId ? `${client.baseUrl}/external/${apiId}` : null,
						method: dynamicUrl ? "POST" : "GET",
						variables: dynamicUrl ? extractTemplateVars(dynamicUrl) : [],
						example: apiId
							? dynamicUrl
								? `curl -X POST -H "apikey: $PULPMINER_API_KEY" -H "Content-Type: application/json" -d '${JSON.stringify(Object.fromEntries(extractTemplateVars(dynamicUrl).map((v) => [v, "..."])))}' ${client.baseUrl}/external/${apiId}`
								: `curl -H "apikey: $PULPMINER_API_KEY" ${client.baseUrl}/external/${apiId}`
							: null,
					},
					apiId ? "API saved." : "API saved, but its id could not be determined; check pulpminer_list_saved_apis.",
				);
			} catch (err) {
				return fail(err);
			}
		},
	);

	// 3. Fetch data from a saved API --------------------------------------------
	server.registerTool(
		"pulpminer_fetch_api_data",
		{
			title: "Fetch JSON from a saved PulpMiner API",
			description:
				"Call a saved PulpMiner API and return its JSON (GET /external/{apiId}, or POST with variables for dynamic APIs). Uses PULPMINER_API_KEY. Costs 0.4 credits (+0.1 if the API renders JS); cached APIs return fast.",
			inputSchema: {
				apiId: z
					.union([z.string().regex(/^\d+$/), z.number().int().positive()])
					.describe("Numeric API id, the value after /external/ in the API URL (e.g. 566)."),
				variables: z
					.record(z.string(), z.string())
					.optional()
					.describe('Only for dynamic APIs: values for every {{ variable }} in its dynamic URL, e.g. {"query": "laptops"}.'),
			},
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
		},
		async ({ apiId, variables }) => {
			try {
				return ok(await client.fetchApiData(String(apiId), variables));
			} catch (err) {
				if (err instanceof PulpMinerError && err.status === 400 && /request is invalid/.test(err.message)) {
					return fail(new PulpMinerError(`${err.message}. This API is dynamic: pass 'variables'.`));
				}
				if (err instanceof PulpMinerError && err.status === 404 && /no data/.test(err.message)) {
					return fail(new PulpMinerError(`${err.message}. This API is not dynamic: call it without 'variables'.`));
				}
				return fail(err);
			}
		},
	);

	// 4. List saved APIs -------------------------------------------------------
	server.registerTool(
		"pulpminer_list_saved_apis",
		{
			title: "List saved PulpMiner APIs",
			description:
				"List the APIs saved under this API key (GET /external/api/url), oldest first, paginated. Returns id, url, dynamic flag and dynamicUrl template for each. Free.",
			inputSchema: {
				page: z.number().int().min(1).default(1).describe("Page number, starting at 1."),
				pageSize: z.number().int().min(5).max(100).default(50).describe("Items per page (5-100)."),
				id: z.number().int().positive().optional().describe("Only return the API with this id."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async (args) => {
			try {
				const rows = await client.listSavedApis(args);
				return ok(
					rows.map((r) => ({
						id: r.id,
						url: r.url,
						dynamic: !!r.dynamic,
						dynamicUrl: r.dynamic ? r.dynamicUrl : undefined,
						variables: r.dynamic ? extractTemplateVars(r.dynamicUrl) : [],
						endpoint: `${client.baseUrl}/external/${r.id}`,
					})),
				);
			} catch (err) {
				return fail(err);
			}
		},
	);

	// 5. Get saved API config (session auth) ----------------------------------
	server.registerTool(
		"pulpminer_get_saved_api_config",
		{
			title: "Get a saved API's full configuration",
			description:
				"Return the full stored config of a saved API (GET /api/ai/json/{id}): url, jsonFormat, cache, renderJs, scraper, llm, selector, extraLLMInfo, dynamicUrl, lastFetched. Requires PULPMINER_SESSION_TOKEN. Free.",
			inputSchema: {
				apiId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).describe("Numeric API id."),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ apiId }) => {
			try {
				const row = await client.getSavedApiConfig(String(apiId));
				if (row && typeof row.jsonFormat === "string") {
					try {
						row.jsonFormat = JSON.parse(row.jsonFormat);
					} catch {
						/* leave as string */
					}
				}
				return ok(row);
			} catch (err) {
				return fail(err);
			}
		},
	);

	// 6. Check API key -----------------------------------------------------------
	server.registerTool(
		"pulpminer_check_api_key",
		{
			title: "Check PulpMiner credentials",
			description:
				"Verify that PULPMINER_API_KEY is valid (GET /external/n8n/auth) and report which credentials are configured. Free.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async () => {
			try {
				return ok({
					baseUrl: client.baseUrl,
					apiKeyConfigured: client.hasApiKey,
					apiKeyValid: client.hasApiKey ? await client.checkApiKey() : null,
					sessionTokenConfigured: client.hasSessionToken,
					generationAuth: client.generationAuthMode,
				});
			} catch (err) {
				return fail(err);
			}
		},
	);

	return server;
};
