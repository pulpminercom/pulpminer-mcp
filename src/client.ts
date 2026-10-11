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

type AuthMode = "apikey" | "session";

/**
 * Thin HTTP client for the PulpMiner API (https://api.pulpminer.com).
 */
export class PulpMinerClient {
	constructor(private readonly config: PulpMinerConfig) {}

	get hasApiKey() {
		return !!this.config.apiKey;
	}
	get hasSessionToken() {
		return !!this.config.sessionToken;
	}
	get baseUrl() {
		return this.config.baseUrl;
	}

	private headers(mode: AuthMode): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": "pulpminer-mcp/0.1.0",
		};
		if (mode === "apikey") {
			if (!this.config.apiKey) {
				throw new PulpMinerError(
					"PULPMINER_API_KEY is not set. Copy your API key from the PulpMiner dashboard (API Keys) and set it in the MCP server's env.",
				);
			}
			h.apikey = this.config.apiKey;
		} else {
			if (!this.config.sessionToken) {
				throw new PulpMinerError(
					"This endpoint currently requires a PulpMiner dashboard session token: set PULPMINER_SESSION_TOKEN. The backend does not yet accept API keys for AI generation / save-as-API (see README, 'Auth limitations').",
				);
			}
			h.authorization = `Bearer ${this.config.sessionToken}`;
		}
		return h;
	}

	async request<T>(
		method: "GET" | "POST" | "PUT" | "DELETE",
		path: string,
		mode: AuthMode,
		opts: { body?: unknown; query?: Record<string, string | number | undefined> } = {},
	): Promise<{ status: number; envelope: PulpMinerEnvelope<T> }> {
		const url = new URL(this.config.baseUrl + path);
		for (const [k, v] of Object.entries(opts.query ?? {})) {
			if (v !== undefined) url.searchParams.set(k, String(v));
		}
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
		let res: Response;
		try {
			res = await fetch(url, {
				method,
				headers: this.headers(mode),
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
			throw new PulpMinerError(`PulpMiner API ${res.status}: ${msg}`, res.status, envelope ?? text);
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

	/**
	 * Generation / save auth. With a session token: /api/ai/json* + Bearer (works today).
	 * Otherwise with an API key: /external/ai/json* + apikey (404 until the API-key
	 * routes are live on the backend).
	 */
	private genRoute(): { prefix: "/api" | "/external"; mode: AuthMode } {
		if (this.config.sessionToken) return { prefix: "/api", mode: "session" };
		if (this.config.apiKey) return { prefix: "/external", mode: "apikey" };
		throw new PulpMinerError(
			"No credentials for AI generation / save-as-API. Set PULPMINER_SESSION_TOKEN (works with the current backend) or PULPMINER_API_KEY (requires the API-key generation routes to be live on the backend).",
		);
	}

	private async genRequest<T>(path: string, body: unknown) {
		const { prefix, mode } = this.genRoute();
		try {
			return await this.request<T>("POST", prefix + path, mode, { body });
		} catch (err) {
			if (mode === "apikey" && err instanceof PulpMinerError && err.status === 404) {
				throw new PulpMinerError(
					`${prefix + path} is not available on ${this.config.baseUrl}: this PulpMiner backend does not accept API keys for AI generation / save-as-API yet. Set PULPMINER_SESSION_TOKEN for now.`,
					404,
				);
			}
			throw err;
		}
	}

	get generationAuthMode(): "session" | "apikey" | null {
		return this.config.sessionToken ? "session" : this.config.apiKey ? "apikey" : null;
	}

	/** POST /api/ai/json (session) or /external/ai/json (apikey). Costs credits (0.25 + 0.1 if renderJs). */
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
		const { envelope } = await this.genRequest<{ json: unknown }>("/ai/json", body);
		return envelope.data?.json ?? null;
	}

	/** POST /api/ai/json/save (session) or /external/ai/json/save (apikey). Backend returns `data: []` (no id). */
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
		const { envelope } = await this.genRequest<unknown>("/ai/json/save", body);
		return envelope.data;
	}

	/** GET /api (session auth) - all saved APIs of the user, newest first. */
	async listSavedApisSession() {
		const { envelope } = await this.request<Record<string, unknown>[]>("GET", "/api", "session");
		return envelope.data ?? [];
	}

	/** GET /api/ai/json/:id (session auth) - full saved config row. */
	async getSavedApiConfig(id: string) {
		const { envelope } = await this.request<Record<string, unknown>>(
			"GET",
			`/api/ai/json/${encodeURIComponent(id)}`,
			"session",
		);
		return envelope.data;
	}

	/**
	 * Best-effort lookup of the newest saved API matching url/dynamicUrl
	 * (needed because the save endpoint does not return the new id).
	 */
	async findNewestSavedApi(url: string, dynamicUrl?: string): Promise<string | number | undefined> {
		const matches = (r: { url: unknown; dynamic: unknown; dynamicUrl: unknown }) =>
			r.url === url && (dynamicUrl ? r.dynamicUrl === dynamicUrl : !r.dynamic);
		if (this.config.sessionToken) {
			const all = await this.listSavedApisSession(); // newest first
			return all.find((r) => matches(r as never))?.id as string | number | undefined;
		}
		if (this.config.apiKey) {
			// /external/api/url is ordered by id ASC: walk to the end, keep the last match.
			let found: string | number | undefined;
			for (let page = 1; page <= 50; page++) {
				const rows = await this.listSavedApis({ page, pageSize: 100 });
				for (const r of rows) if (matches(r)) found = r.id;
				if (rows.length < 100) break;
			}
			return found;
		}
		return undefined;
	}

	/** GET /external/api/url (apikey) - paginated list, ordered by id ASC. */
	async listSavedApis(query: { page?: number; pageSize?: number; id?: number }) {
		const { envelope } = await this.request<SavedApiSummary[]>(
			"GET",
			"/external/api/url",
			"apikey",
			{ query },
		);
		return envelope.data ?? [];
	}

	/** GET /external/:apiId (static API) or POST /external/:apiId (dynamic API with variables). */
	async fetchApiData(apiId: string, variables?: Record<string, string>) {
		const path = `/external/${encodeURIComponent(apiId)}`;
		const { envelope } =
			variables && Object.keys(variables).length > 0
				? await this.request<unknown>("POST", path, "apikey", { body: variables })
				: await this.request<unknown>("GET", path, "apikey");
		return envelope.data;
	}

	/** GET /external/n8n/auth (apikey) - 200 if key exists, 404 otherwise. */
	async checkApiKey(): Promise<boolean> {
		try {
			await this.request("GET", "/external/n8n/auth", "apikey");
			return true;
		} catch (err) {
			if (err instanceof PulpMinerError && err.status === 404) return false;
			throw err;
		}
	}
}
