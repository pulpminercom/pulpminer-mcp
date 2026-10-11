/**
 * Runtime configuration, read from environment variables.
 *
 * PULPMINER_API_KEY        API key from the PulpMiner dashboard (sent as the `apikey` header).
 *                          Used by every tool.
 * PULPMINER_BASE_URL       API base URL. Default: https://api.pulpminer.com
 * PULPMINER_TIMEOUT_MS     Per-request timeout. Default: 300000 (scrape + LLM can be slow).
 */
export interface PulpMinerConfig {
	baseUrl: string;
	apiKey?: string;
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
	timeoutMs: Number(clean(env.PULPMINER_TIMEOUT_MS) ?? 300_000) || 300_000,
});
