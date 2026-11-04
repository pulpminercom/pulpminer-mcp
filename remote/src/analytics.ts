// Server-side PostHog events for MCP traffic. Records which tools get used and
// by which clients, never the token, tool arguments (URLs, prompts) or results.
// The PulpMiner API separately records external_api_called and mcp_oauth_connected.

const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";
const USER_AGENT_LENGTH = 120;

export type AnalyticsEnv = { POSTHOG_KEY?: string; POSTHOG_HOST?: string };

type RpcMessage = { id?: string | number; method?: string; params?: Record<string, any> };
type RpcReply = { id?: string | number; result?: { isError?: boolean }; error?: unknown };

const postEvent = async (host: string, key: string, uuid: string, event: string, distinctId: string, properties: Record<string, unknown>) => {
	const res = await fetch(`${host.replace(/\/+$/, "")}/i/v0/e/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			api_key: key,
			uuid,
			event,
			distinct_id: distinctId,
			timestamp: new Date().toISOString(),
			properties: { ...properties, $lib: "pulpminer-mcp", $geoip_disable: true, $process_person_profile: false },
		}),
	});
	if (!res.ok) throw new Error(`PostHog capture failed: ${res.status}`);
};

// Uses our proxy and falls back to the standard ingest host. Never throws.
export const capture = async (env: AnalyticsEnv, event: string, distinctId: string, properties: Record<string, unknown> = {}) => {
	if (!env.POSTHOG_KEY) return;
	const uuid = crypto.randomUUID();
	const primary = env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST;
	try {
		await postEvent(primary, env.POSTHOG_KEY, uuid, event, distinctId, properties);
	} catch (err) {
		try {
			if (primary === DEFAULT_POSTHOG_HOST) throw err;
			await postEvent(DEFAULT_POSTHOG_HOST, env.POSTHOG_KEY, uuid, event, distinctId, properties);
		} catch (fallbackErr) {
			console.error("[posthog] capture failed", fallbackErr);
		}
	}
};

// A stable anonymous id, so one connection counts once without storing its token.
export const anonymousId = async (token: string) => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `mcp_${hex.slice(0, 32)}`;
};

export const userAgentOf = (req: Request) => req.headers.get("user-agent")?.slice(0, USER_AGENT_LENGTH) ?? null;

const asList = <T>(value: unknown) => (Array.isArray(value) ? value : value ? [value] : []) as T[];

// Reads a copy of the JSON-RPC exchange after the request has been answered.
export const trackRpc = async (env: AnalyticsEnv, token: string, userAgent: string | null, request: unknown, response: Response, startedAt: number) => {
	const messages = asList<RpcMessage>(request).filter(
		(m) => m?.method === "initialize" || (m?.method === "tools/call" && typeof m.params?.name === "string"),
	);
	if (!messages.length) return;
	const durationMs = Date.now() - startedAt;
	const replies = asList<RpcReply>(await response.json().catch(() => null));
	const distinctId = await anonymousId(token);
	await Promise.all(
		messages.map((m) => {
			if (m.method === "initialize") {
				return capture(env, "mcp_client_initialized", distinctId, {
					client_name: m.params?.clientInfo?.name ?? null,
					client_version: m.params?.clientInfo?.version ?? null,
					protocol_version: m.params?.protocolVersion ?? null,
					user_agent: userAgent,
				});
			}
			const reply = replies.find((r) => r?.id === m.id);
			return capture(env, "mcp_tool_called", distinctId, {
				tool: m.params?.name,
				success: Boolean(reply?.result) && !reply?.result?.isError && !reply?.error,
				duration_ms: durationMs,
				http_status: response.status,
				user_agent: userAgent,
			});
		}),
	);
};
