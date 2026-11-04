// The page people see when they open https://mcp.pulpminer.com in a browser.
// Static and self-contained; it is served for GET / only, MCP traffic stays on /mcp.

const SERVER_URL = "https://mcp.pulpminer.com/mcp";
const DOCS_URL = "https://docs.pulpminer.com/integrations/mcp";
const GITHUB_URL = "https://github.com/pulpminercom/pulpminer-mcp";
const NPM_URL = "https://www.npmjs.com/package/pulpminer-mcp";
const POSTHOG_KEY = "phc_SMgi912O0Sxd59rZUUA26zGV7VrHKGE8MmFvS897rdn"; // public project key, same as pulpminer.com

export const landingHtml = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PulpMiner MCP server</title>
<meta name="description" content="Connect Claude, Cursor and other AI assistants to PulpMiner. Turn web pages into JSON, save them as APIs and call them, right from a chat.">
<link rel="icon" href="https://www.pulpminer.com/favicon.ico">
<meta property="og:title" content="PulpMiner MCP server">
<meta property="og:description" content="Turn web pages into JSON from Claude, Cursor or any MCP client.">
<meta property="og:url" content="https://mcp.pulpminer.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
	--page: #f7f4ee; --card: #fdfbf7; --raised: #efe9df; --line: rgba(31, 27, 22, 0.09);
	--ink: #1f1b16; --ink-2: #5e554a; --mute: #7b7266;
	--night: #1c1a18; --night-2: #262421; --night-ink: #efe9de; --night-mute: #aaa398;
	--lamp: #f0a500; --lamp-hover: #e09a00; --lamp-ink: #8a5a00;
	--ease: cubic-bezier(0.2, 0.7, 0.2, 1);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body { background: var(--page); color: var(--ink); font: 16px/1.5 "Instrument Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: inherit; }
code, pre, .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-variant-ligatures: none; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
@media (min-width: 640px) { .wrap { padding: 0 32px; } }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 6px; }

/* nav */
header { border-bottom: 1px solid var(--line); }
.nav { height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-weight: 500; font-size: 17px; }
.brand img { width: 28px; height: 28px; }
.brand span { color: var(--mute); font-weight: 400; }
.links { display: flex; align-items: center; gap: 16px; font-size: 15px; }
@media (min-width: 640px) { .links { gap: 24px; } }
@media (max-width: 420px) { .brand span { display: none; } }
.links a { text-decoration: none; color: var(--ink-2); transition: color 150ms var(--ease); }
.links a:hover { color: var(--ink); }
.links .hide-sm { display: none; }
@media (min-width: 720px) { .links .hide-sm { display: inline; } }
.btn { white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 8px; font: 500 14px/1 "Instrument Sans", sans-serif; text-decoration: none; cursor: pointer; border: 0; transition: background-color 150ms var(--ease), transform 150ms var(--ease); }
.btn:active { transform: scale(0.98); }
.btn-ink { background: var(--ink); color: var(--page) !important; }
.btn-ink:hover { background: #3a332b; }
.btn-amber { background: var(--lamp); color: var(--ink); }
.btn-amber:hover { background: var(--lamp-hover); }

/* hero */
.hero { display: grid; gap: 48px; align-items: center; padding-block: 64px 96px; }
.hero > * { min-width: 0; }
@media (min-width: 1024px) { .hero { grid-template-columns: 1fr 1.05fr; gap: 64px; padding-block: 96px 128px; } }
.kicker { font-size: 14px; color: var(--ink-2); display: flex; align-items: center; gap: 8px; }
.live { width: 8px; height: 8px; border-radius: 4px; background: #16a34a; }
h1 { margin-top: 16px; font-size: 40px; line-height: 1.06; font-weight: 500; letter-spacing: -0.03em; max-width: 14ch; text-wrap: balance; }
@media (min-width: 640px) { h1 { font-size: 56px; } }
.lede { margin-top: 20px; max-width: 46ch; font-size: 18px; line-height: 28px; color: var(--ink-2); }
.url { margin-top: 32px; display: flex; align-items: center; gap: 8px; max-width: 480px; padding: 6px 6px 6px 16px; background: #fff; border: 1px solid rgba(31, 27, 22, 0.14); border-radius: 12px; }
.url code { flex: 1; min-width: 0; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.url .btn { height: 36px; flex: none; }
.under { margin-top: 16px; font-size: 15px; color: var(--ink-2); }
.under a { color: var(--ink); text-underline-offset: 4px; }

/* chat moment */
.chat { background: var(--card); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 1px 2px rgba(31, 27, 22, 0.04), 0 24px 48px -16px rgba(31, 27, 22, 0.14); overflow: hidden; }
.chat-top { height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--mute); }
.chat-top b { font-weight: 500; color: var(--ink); }
.chat-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.msg-user { align-self: flex-end; max-width: 86%; background: var(--raised); padding: 12px 16px; border-radius: 16px 16px 4px 16px; font-size: 15px; line-height: 22px; }
.tool { border: 1px solid var(--line); border-radius: 12px; background: #fff; overflow: hidden; }
.tool-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 13px; color: var(--mute); }
.tool-head code { color: var(--ink); font-size: 13px; }
.tool-head .ok { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.tool pre { padding: 14px; font-size: 13px; line-height: 21px; overflow-x: auto; color: var(--ink); background: var(--page); }
.k { color: var(--ink); } .s { color: #8a5a00; } .n { color: #2f6680; } .b { color: #3f6b3f; } .p { color: var(--mute); }
.msg-ai { font-size: 15px; line-height: 23px; color: var(--ink-2); }
.msg-ai code { font-size: 13px; background: var(--raised); padding: 1px 6px; border-radius: 5px; color: var(--ink); }

/* sections */
section { border-top: 1px solid var(--line); }
.sec { padding-block: 96px; }
h2 { font-size: 32px; line-height: 1.15; font-weight: 500; letter-spacing: -0.02em; }
.sec-sub { margin-top: 8px; font-size: 17px; color: var(--ink-2); max-width: 56ch; }
.grid3 { margin-top: 40px; display: grid; gap: 16px; }
@media (min-width: 1180px) { .grid3 { grid-template-columns: 1fr 1fr 1fr; } }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; min-width: 0; }
.card h3 { font-size: 17px; font-weight: 500; }
.card .meta { font-size: 14px; color: var(--mute); margin-top: 2px; }
.card ol { margin-top: 16px; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 15px; color: var(--ink-2); }
.card ol code { font-size: 13px; background: var(--raised); padding: 1px 6px; border-radius: 5px; color: var(--ink); word-break: break-all; }
.code { margin-top: 16px; position: relative; background: var(--night); color: var(--night-ink); border-radius: 12px; padding: 16px; font-size: 13px; line-height: 21px; overflow-x: auto; }
.code .s { color: #f0c46a; } .code .p { color: var(--night-mute); }
.copy-sm { position: absolute; top: 8px; right: 8px; height: 28px; padding: 0 10px; border-radius: 6px; border: 0; background: var(--night-2); color: var(--night-mute); font: 500 12px/1 "Instrument Sans", sans-serif; cursor: pointer; transition: color 150ms var(--ease); }
.copy-sm:hover { color: var(--night-ink); }

table { margin-top: 40px; width: 100%; border-collapse: collapse; font-size: 15px; }
th { text-align: left; font-weight: 400; font-size: 14px; color: var(--mute); padding: 12px 16px 12px 0; border-bottom: 1px solid var(--line); }
td { padding: 16px 16px 16px 0; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--ink-2); }
td:first-child code { color: var(--ink); font-size: 14px; white-space: nowrap; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink); }
.table-wrap { overflow-x: auto; }
.note { margin-top: 16px; font-size: 14px; color: var(--mute); }

.two { margin-top: 40px; display: grid; gap: 16px; }
@media (min-width: 900px) { .two { grid-template-columns: 1fr 1fr; } }
.two p { margin-top: 8px; font-size: 15px; color: var(--ink-2); line-height: 24px; }

.cta { background: var(--night); color: var(--night-ink); border-radius: 20px; padding: 40px; display: flex; flex-direction: column; gap: 24px; }
@media (min-width: 900px) { .cta { flex-direction: row; align-items: center; justify-content: space-between; padding: 48px; } }
.cta p { margin-top: 8px; color: var(--night-mute); font-size: 16px; max-width: 52ch; }
.cta .btn-light { background: var(--night-ink); color: var(--night); }
.cta .btn-light:hover { background: #fff; }

footer { border-top: 1px solid var(--line); padding: 32px 0 48px; font-size: 14px; color: var(--mute); }
.foot { display: flex; flex-wrap: wrap; gap: 16px 24px; justify-content: space-between; }
.foot nav { display: flex; flex-wrap: wrap; gap: 24px; }
.foot a { text-decoration: none; transition: color 150ms var(--ease); }
.foot a:hover { color: var(--ink); }
</style>
<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],o="capture register register_once identify reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init("${POSTHOG_KEY}", { api_host: "https://n.pulpminer.com", person_profiles: "identified_only", defaults: "2026-01-30" });
</script>
</head>
<body>
<header>
	<div class="wrap nav">
		<a class="brand" href="https://www.pulpminer.com"><img src="https://www.pulpminer.com/logo.png" alt="">PulpMiner <span>MCP</span></a>
		<nav class="links">
			<a href="${DOCS_URL}">Docs</a>
			<a class="hide-sm" href="${GITHUB_URL}">GitHub</a>
			<a class="hide-sm" href="${NPM_URL}">npm</a>
			<a class="btn btn-ink" href="https://www.pulpminer.com/api">Get an API key</a>
		</nav>
	</div>
</header>

<main>
	<div class="wrap hero">
		<div>
			<p class="kicker"><span class="live"></span>MCP server for PulpMiner</p>
			<h1>Turn web pages into JSON from your AI assistant</h1>
			<p class="lede">Connect Claude, Cursor or any MCP client. Ask in plain words, and it reads the page as JSON, saves it as an API and calls it again whenever you need fresh data.</p>
			<div class="url">
				<code id="server-url">${SERVER_URL}</code>
				<button class="btn btn-amber" type="button" data-copy="${SERVER_URL}">Copy URL</button>
			</div>
			<p class="under">Add it as a connector and sign in with PulpMiner. <a href="${DOCS_URL}">Read the setup guide</a></p>
		</div>

		<div class="chat" aria-label="Example conversation">
			<div class="chat-top"><b>New chat</b><span>PulpMiner connected</span></div>
			<div class="chat-body">
				<div class="msg-user">Get the title, author, price and rating from copperbooks.com/books/field-notes-on-copper</div>
				<div class="tool">
					<div class="tool-head"><code>pulpminer_generate_json</code><span class="ok"><span class="live"></span>0.35 credits</span></div>
<pre><span class="p">{</span>
  <span class="k">"title"</span><span class="p">:</span> <span class="s">"Field Notes on Copper"</span><span class="p">,</span>
  <span class="k">"author"</span><span class="p">:</span> <span class="s">"Ines Varga"</span><span class="p">,</span>
  <span class="k">"price"</span><span class="p">:</span> <span class="n">24</span><span class="p">,</span>
  <span class="k">"rating"</span><span class="p">:</span> <span class="n">4.7</span>
<span class="p">}</span></pre>
				</div>
				<div class="msg-user">Save it as an API with the book slug as a variable</div>
				<p class="msg-ai">Saved. Call <code>POST api.pulpminer.com/external/566</code> with a <code>slug</code> to get any book in the same shape.</p>
			</div>
		</div>
	</div>

	<section>
		<div class="wrap sec">
			<h2>Connect in a minute</h2>
			<p class="sec-sub">Use the hosted server with nothing to install, or run the npm package on your own machine.</p>
			<div class="grid3">
				<div class="card">
					<h3>Claude</h3>
					<p class="meta">Hosted, sign in with PulpMiner</p>
					<ol>
						<li>Open Settings, then Connectors, and add a custom connector</li>
						<li>Paste <code>${SERVER_URL}</code></li>
						<li>Select Connect and sign in with your PulpMiner account</li>
					</ol>
				</div>
				<div class="card">
					<h3>Cursor</h3>
					<p class="meta">Hosted, with your API key, in .cursor/mcp.json</p>
<div class="code"><button class="copy-sm" type="button" data-copy-next data-track="cursor_config">Copy</button><pre>{
  <span class="s">"mcpServers"</span>: {
    <span class="s">"pulpminer"</span>: {
      <span class="s">"url"</span>: <span class="s">"${SERVER_URL}"</span>,
      <span class="s">"headers"</span>: {
        <span class="s">"Authorization"</span>: <span class="s">"Bearer YOUR_API_KEY"</span>
      }
    }
  }
}</pre></div>
				</div>
				<div class="card">
					<h3>Run it locally</h3>
					<p class="meta">npm package, Node.js 18 or later</p>
<div class="code"><button class="copy-sm" type="button" data-copy-next data-track="local_config">Copy</button><pre>{
  <span class="s">"mcpServers"</span>: {
    <span class="s">"pulpminer"</span>: {
      <span class="s">"command"</span>: <span class="s">"npx"</span>,
      <span class="s">"args"</span>: [<span class="s">"-y"</span>, <span class="s">"pulpminer-mcp"</span>],
      <span class="s">"env"</span>: {
        <span class="s">"PULPMINER_API_KEY"</span>: <span class="s">"YOUR_API_KEY"</span>
      }
    }
  }
}</pre></div>
				</div>
			</div>
		</div>
	</section>

	<section>
		<div class="wrap sec">
			<h2>Five tools your assistant can use</h2>
			<p class="sec-sub">The same things you do in the PulpMiner dashboard, at the same credit cost.</p>
			<div class="table-wrap">
				<table>
					<thead><tr><th>Tool</th><th>What it does</th><th>Credits</th></tr></thead>
					<tbody>
						<tr><td><code>pulpminer_generate_json</code></td><td>Reads a web page and returns it as JSON, in a shape you describe if you like</td><td class="num">0.25, or 0.35 with JavaScript</td></tr>
						<tr><td><code>pulpminer_save_as_api</code></td><td>Saves the page and its JSON shape as your own API, with optional URL variables and caching</td><td class="num">Free</td></tr>
						<tr><td><code>pulpminer_fetch_api_data</code></td><td>Calls a saved API for fresh data</td><td class="num">0.4, or 0.5 with JavaScript</td></tr>
						<tr><td><code>pulpminer_list_saved_apis</code></td><td>Lists the APIs you've saved</td><td class="num">Free</td></tr>
						<tr><td><code>pulpminer_check_api_key</code></td><td>Checks that your credentials work</td><td class="num">Free</td></tr>
					</tbody>
				</table>
			</div>
			<p class="note">Saved APIs are ordinary PulpMiner endpoints, so you can also call them from your own code, n8n or Zapier.</p>
		</div>
	</section>

	<section>
		<div class="wrap sec">
			<h2>Your key stays yours</h2>
			<div class="two">
				<div class="card">
					<h3>Sign in, or bring a key</h3>
					<p>Clients that support OAuth let you sign in with your PulpMiner account. Others send your API key as <code>Authorization: Bearer</code> or the <code>x-pulpminer-api-key</code> header.</p>
				</div>
				<div class="card">
					<h3>Nothing is stored</h3>
					<p>The server is stateless. Your key is only passed on to the PulpMiner API to run the tool you asked for, and never saved.</p>
				</div>
			</div>
		</div>
	</section>

	<section>
		<div class="wrap sec">
			<div class="cta">
				<div>
					<h2>Need an API key?</h2>
					<p>Sign up for PulpMiner, then copy your key from Saved APIs. Credits never expire.</p>
				</div>
				<a class="btn btn-light" href="https://www.pulpminer.com/api">Get an API key</a>
			</div>
		</div>
	</section>
</main>

<footer>
	<div class="wrap foot">
		<span>PulpMiner MCP server</span>
		<nav>
			<a href="https://www.pulpminer.com">pulpminer.com</a>
			<a href="${DOCS_URL}">Docs</a>
			<a href="${GITHUB_URL}">GitHub</a>
			<a href="${NPM_URL}">npm</a>
			<a href="mailto:hello@pulpminer.com">Support</a>
		</nav>
	</div>
</footer>

<script>
function track(event, properties) {
	try { posthog.capture(event, properties); } catch (err) { console.error(err); }
}
document.addEventListener("click", function (e) {
	var link = e.target.closest("a[href]");
	if (link) {
		var area = link.closest("header, footer, section");
		var heading = area && area.querySelector("h2");
		track("mcp_landing_link_clicked", {
			destination: link.href,
			label: link.textContent.trim().slice(0, 60),
			area: heading ? heading.textContent.trim().slice(0, 60) : area ? area.tagName.toLowerCase() : "hero",
		});
		return;
	}
	var btn = e.target.closest("[data-copy], [data-copy-next]");
	if (!btn) return;
	track("mcp_landing_copied", { target: btn.getAttribute("data-track") || "server_url" });
	var text = btn.hasAttribute("data-copy") ? btn.getAttribute("data-copy") : btn.nextElementSibling.textContent;
	navigator.clipboard.writeText(text).then(function () {
		var label = btn.textContent;
		btn.textContent = "Copied";
		setTimeout(function () { btn.textContent = label; }, 1500);
	});
});
</script>
</body>
</html>`;
