import type { PulpMinerConfig } from "./config.js";

/** Every PulpMiner endpoint responds with this envelope. */
export interface PulpMinerEnvelope<T = unknown> {
	data: T | null;
	errors: { message: string }[] | null;
}

export class PulpMinerError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly body?: unknown,
	) {
		super(message);
		this.name = "PulpMinerError";
	}
}

/** Mirrors the `urls` table row returned by /external/api/url. */
export interface SavedApiSummary {
	id: number | string;
	url: string;
	dynamicUrl: string;
	dynamic: number;
}

/**
 * Thin HTTP client for the PulpMiner API (https://api.pulpminer.com).
 */
export class PulpMinerClient {
	constructor(private readonly config: PulpMinerConfig) {}

	get hasApiKey() {
		return !!this.config.apiKey;
	}
	get baseUrl() {
		return this.config.baseUrl;
	}

	private headers(): Record<string, string> {
		if (!this.config.apiKey) {
			throw new PulpMinerError(
				"PULPMINER_API_KEY is not set. Copy your API key from the PulpMiner dashboard (API Keys) and set it in the MCP server's env.",
			);
		}
		return {
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": "pulpminer-mcp/0.1.0",
			apikey: this.config.apiKey,
		};
	}

	async request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		opts: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
	): Promise<{ status: number; envelope: PulpMinerEnvelope<T> }> {
		const url = new URL(this.config.baseUrl + path);
		for (const [k, v] of Object.entries(opts.query ?? {})) {
			if (v !== undefined) url.searchParams.set(k, String(v));
		}
		// Build headers first so missing-credential errors are not reported as network errors.
		const headers = this.headers();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		let res: Response;
		try {
			res = await fetch(url, {
				method,
				headers,
				body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
				signal: controller.signal,
			});
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				throw new PulpMinerError(
					`Request to ${url.pathname} timed out after ${this.config.timeoutMs} ms`,
				);
			}
			throw new PulpMinerError(
				`Network error calling ${url.pathname}: ${(err as Error).message}`,
			);
		} finally {
			clearTimeout(timer);
		}

		const text = await res.text();
		let envelope: PulpMinerEnvelope<T> | undefined;
		try {
			envelope = text ? (JSON.parse(text) as PulpMinerEnvelope<T>) : undefined;
		} catch {
			envelope = undefined;
		}

		if (!res.ok) {
			const msg =
				envelope?.errors?.map((e) => e.message).join("; ") ||
				text.slice(0, 500) ||
				res.statusText;
			const hint =
				res.status === 402 ? " Buy more credits at https://www.pulpminer.com/credits." : "";
			throw new PulpMinerError(`PulpMiner API ${res.status}: ${msg}${hint}`, res.status, envelope ?? text);
		}
		if (!envelope) {
			// e.g. /external/n8n/auth returns {data:null,errors:null}; anything non-JSON is unexpected
			return { status: res.status, envelope: { data: null, errors: null } };
		}
		if (envelope.errors?.length) {
			throw new PulpMinerError(
				`PulpMiner API: ${envelope.errors.map((e) => e.message).join("; ")}`,
				res.status,
				envelope,
			);
		}
		return { status: res.status, envelope };
	}

	/** POST to the API-key generation routes (/external/ai/json*). */
	private async genRequest<T>(path: string, body: unknown) {
		try {
			return await this.request<T>("POST", path, { body });
		} catch (err) {
			if (err instanceof PulpMinerError && err.status === 404) {
				throw new PulpMinerError(
					`${path} is not available on ${this.config.baseUrl}: this PulpMiner backend does not accept API keys for AI generation / save-as-API. Check PULPMINER_BASE_URL (default https://api.pulpminer.com).`,
					404,
				);
			}
			throw err;
		}
	}

	/** POST /external/ai/json. Costs credits (0.25 + 0.1 if renderJs). */
	async generateJson(body: {
		url: string;
		scraper: string;
		llm: string;
		renderJs?: "on";
		useSession?: "on";
		jsonFormat?: string;
		extraLLMInfo?: string;
		selector?: string;
	}) {
		const { envelope } = await this.genRequest<{ json: unknown }>("/external/ai/json", body);
		return envelope.data?.json ?? null;
	}

	/** POST /external/ai/json/save. Backend returns `data: []` (no id). */
	async saveAiJson(body: {
		url: string;
		jsonFormat: string;
		dynamic: "true" | "false";
		dynamicURL?: string;
		renderJs: "true" | "false";
		useSession: "true" | "false";
		cache?: "on";
		scraper: string;
		llm: string;
		selector?: string;
		extraLLMInfo?: string;
	}) {
		const { envelope } = await this.genRequest<unknown>("/external/ai/json/save", body);
		return envelope.data;
	}

	/**
	 * Best-effort lookup of the newest saved API matching url/dynamicUrl
	 * (needed because the save endpoint does not return the new id).
	 */
	async findNewestSavedApi(url: string, dynamicUrl?: string): Promise<string | number | undefined> {
		const matches = (r: { url: unknown; dynamic: unknown; dynamicUrl: unknown }) =>
			r.url === url && (dynamicUrl ? r.dynamicUrl === dynamicUrl : !r.dynamic);
		// /external/api/url is ordered by id ASC: walk to the end, keep the last match.
		let found: string | number | undefined;
		for (let page = 1; page <= 50; page++) {
			const rows = await this.listSavedApis({ page, pageSize: 100 });
			for (const r of rows) if (matches(r)) found = r.id;
			if (rows.length < 100) break;
		}
		return found;
	}

	/** GET /external/api/url (apikey) - paginated list, ordered by id ASC. */
	async listSavedApis(query: { page?: number; pageSize?: number; id?: number }) {
		const { envelope } = await this.request<SavedApiSummary[]>(
			"GET",
			"/external/api/url",
			{ query },
		);
		return envelope.data ?? [];
	}

	/** GET /external/:apiId (static API) or POST /external/:apiId (dynamic API with variables). */
	async fetchApiData(apiId: string, variables?: Record<string, string>) {
		const path = `/external/${encodeURIComponent(apiId)}`;
		const { envelope } =
			variables && Object.keys(variables).length > 0
				? await this.request<unknown>("POST", path, { body: variables })
				: await this.request<unknown>("GET", path);
		return envelope.data;
	}

	/** GET /external/n8n/auth (apikey) - 200 if key exists, 404 otherwise. */
	async checkApiKey(): Promise<boolean> {
		try {
			await this.request("GET", "/external/n8n/auth");
			return true;
		} catch (err) {
			if (err instanceof PulpMinerError && err.status === 404) return false;
			throw err;
		}
	}
}
