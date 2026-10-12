# PulpMiner MCP Server

Source: [github.com/pulpminercom/pulpminer-mcp](https://github.com/pulpminercom/pulpminer-mcp) · Issues: [github.com/pulpminercom/pulpminer-mcp/issues](https://github.com/pulpminercom/pulpminer-mcp/issues)

An [MCP](https://modelcontextprotocol.io) server for [PulpMiner](https://pulpminer.com). It lets AI assistants (Cursor, Claude Desktop, and any other MCP client):

- **Generate JSON from any web page with AI.** PulpMiner scrapes the page and an LLM turns it into structured JSON, optionally in the exact shape you give it.
- **Save a page-to-JSON setup as a reusable REST API** (static, or dynamic with `{{ variables }}` in the URL).
- **Fetch data from saved APIs** and list them.

## Tools

| Tool | What it does | Backend endpoint | Credits |
|---|---|---|---|
| `pulpminer_generate_json` | Scrape a URL and convert it to JSON with AI (optional `jsonFormat` sample, CSS `selector`, extra instructions) | `POST /external/ai/json` | 0.25 (+0.1 renderJs) |
| `pulpminer_save_as_api` | Save URL + JSON format (+ optional dynamic URL template, cache) as an API; returns the API id and endpoint | `POST /external/ai/json/save` | free |
| `pulpminer_fetch_api_data` | Call a saved API (GET, or POST with `variables` for dynamic APIs) | `GET/POST /external/{apiId}` | 0.4 (+0.1 renderJs) |
| `pulpminer_list_saved_apis` | List saved APIs (id, url, dynamic URL template and its variables) | `GET /external/api/url` | free |
| `pulpminer_check_api_key` | Validate the API key and show which credentials are configured | `GET /external/n8n/auth` | free |

Option values match the backend: `scraper` is `scraper_1` (default) or `scraper_2`. `llm` is `llm_2` (OpenAI GPT, default), `llm_1` (Google Gemini), or `llm_3` (Groq, only if enabled for your account).

## Configuration

| Env var | Required | Description |
|---|---|---|
| `PULPMINER_API_KEY` | yes | Your API key from the PulpMiner dashboard → API Keys. Sent as the `apikey` header. It is the only credential any tool needs. |
| `PULPMINER_BASE_URL` | no | Default `https://api.pulpminer.com` |
| `PULPMINER_TIMEOUT_MS` | no | Default `300000` (scraping plus the LLM step can take a while) |

## Install & build

```bash
git clone https://github.com/pulpminercom/pulpminer-mcp.git
cd pulpminer-mcp
npm install
npm run build
```

Run it:

```bash
PULPMINER_API_KEY=... node dist/index.js          # stdio
PULPMINER_API_KEY=... node dist/index.js --http   # Streamable HTTP on http://127.0.0.1:3333/mcp
```

Once published to npm, this becomes `npx -y pulpminer-mcp`.

## Client configuration

### Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "pulpminer": {
      "command": "npx",
      "args": ["-y", "pulpminer-mcp"],
      "env": { "PULPMINER_API_KEY": "your-api-key" }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "pulpminer": {
      "command": "npx",
      "args": ["-y", "pulpminer-mcp"],
      "env": { "PULPMINER_API_KEY": "your-api-key" }
    }
  }
}
```

Before it is published, use a local build: `"command": "node", "args": ["/absolute/path/to/pulpminer-mcp/dist/index.js"]`.

### Streamable HTTP clients

Start with `--http` (`PORT`, `HOST` env; it binds to `127.0.0.1:3333` by default) and point the client at `http://127.0.0.1:3333/mcp`. The server is stateless. Each request can send its own API key in the `x-pulpminer-api-key` header, which overrides `PULPMINER_API_KEY`. That makes it usable as a hosted multi-user endpoint (put it behind HTTPS).

```json
{
  "mcpServers": {
    "pulpminer": {
      "url": "http://127.0.0.1:3333/mcp",
      "headers": { "x-pulpminer-api-key": "your-api-key" }
    }
  }
}
```

## Typical flow

1. `pulpminer_generate_json { url, jsonFormat? }`: preview the JSON.
2. `pulpminer_save_as_api { url, jsonFormat, cache?, dynamicUrl? }` returns `apiId` and `endpoint`.
3. `pulpminer_fetch_api_data { apiId, variables? }`

Dynamic API example: `dynamicUrl: "https://example.com/search?q={{ query }}"`, then fetch it with `variables: { "query": "laptops" }`.

## Development

```bash
npm test        # builds, then runs scripts/smoke-test.mjs against a local mock API (no real calls)
npm run inspect # opens the MCP Inspector UI
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
```

## Hosted server (remote)

`remote/` is a Cloudflare Worker serving the same tools over Streamable HTTP (stateless) at `https://mcp.pulpminer.com/mcp`. Send your PulpMiner API key as `Authorization: Bearer <key>` (or `x-pulpminer-api-key`); it is only forwarded to the PulpMiner API, never stored.

```json
{ "mcpServers": { "pulpminer": { "url": "https://mcp.pulpminer.com/mcp", "headers": { "Authorization": "Bearer YOUR_API_KEY" } } } }
```

Local dev: `cd remote && npm install && npm run dev` (Node 22+).
