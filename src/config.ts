/**
 * Runtime configuration, read from environment variables.
 *
 * PULPMINER_API_KEY        API key from the PulpMiner dashboard (sent as the `apikey` header).
 *                          Used for /external/* endpoints (fetching saved APIs, listing them).
 * PULPMINER_SESSION_TOKEN  Optional dashboard session JWT (sent as `Authorization: Bearer ...`).
 *                          Today the backend's AI-generation and save-as-API endpoints
 *                          (/api/ai/json, /api/ai/json/save) only accept this. See README.
 * PULPMINER_BASE_URL       API base URL. Default: https://api.pulpminer.com
 * PULPMINER_TIMEOUT_MS     Per-request timeout. Default: 300000 (scrape + LLM can be slow).
 */
export interface PulpMinerConfig {
	baseUrl: string;
	apiKey?: string;
	sessionToken?: string;
	timeoutMs: number;
}

const clean = (v: string | undefined) => {
	const t = v?.trim();
	return t ? t : undefined;
};

export const loadConfig = (
	env: NodeJS.ProcessEnv = process.env,
): PulpMinerConfig => ({
	baseUrl: (clean(env.PULPMINER_BASE_URL) ?? "https://api.pulpminer.com").replace(
		/\/+$/,
		"",
	),
	apiKey: clean(env.PULPMINER_API_KEY),
	sessionToken: clean(env.PULPMINER_SESSION_TOKEN)?.replace(/^Bearer\s+/i, ""),
	timeoutMs: Number(clean(env.PULPMINER_TIMEOUT_MS) ?? 300_000) || 300_000,
});
