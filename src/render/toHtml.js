import { toMermaid } from "./toMermaid.js";

export function toHtml(manifest, options = {}) {
  const mermaid = options.mermaid || toMermaid(manifest);
  const title = escapeHtml(manifest.title || manifest.id || "Sextant");
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
  const llmBadge = manifest.llm?.enriched
    ? `<span class="badge">LLM enriched · ${escapeHtml(manifest.llm.provider)} · ${escapeHtml(manifest.llm.model)} · cache ${escapeHtml(manifest.llm.cache)}</span>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} - Sextant</title>
  <style>
    :root {
      --bg: #fbf7ed;
      --panel: #fffdf7;
      --line: #ded6c6;
      --text: #25211b;
      --muted: #6f675c;
      --accent: #c8792a;
      --accent-soft: #f5e5cd;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    header {
      min-height: 72px;
      padding: 20px 28px 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(255, 253, 247, 0.9);
    }

    header h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    header p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      margin-top: 10px;
      padding: 4px 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--accent-soft);
      color: #5d3611;
      font-size: 12px;
      font-weight: 700;
    }

    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      min-height: calc(100vh - 72px);
    }

    .graph {
      overflow: auto;
      padding: 28px;
    }

    .mermaid {
      min-width: 760px;
      padding: 24px;
      border: 1px solid var(--line);
      background: #fffaf0;
    }

    aside {
      border-left: 1px solid var(--line);
      background: var(--panel);
      padding: 22px;
      overflow: auto;
    }

    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    #detail h2 {
      margin: 6px 0 12px;
      font-size: 18px;
      line-height: 1.25;
    }

    .meta {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      padding: 4px 8px;
      border-radius: 6px;
      background: var(--accent-soft);
      color: #5d3611;
      font-size: 12px;
      font-weight: 700;
    }

    section {
      margin-top: 20px;
    }

    section h3 {
      margin: 0 0 8px;
      font-size: 13px;
      color: var(--muted);
      text-transform: uppercase;
    }

    ul {
      margin: 0;
      padding-left: 18px;
    }

    li {
      margin: 6px 0;
      line-height: 1.4;
    }

    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      color: #4b3d2b;
    }

    .empty {
      color: var(--muted);
      line-height: 1.5;
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }

      aside {
        border-left: 0;
        border-top: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p>Sextant process graph. Macro first, details on click.</p>
    ${llmBadge}
  </header>
  <main>
    <div class="graph">
      <pre class="mermaid">
${escapeHtml(mermaid)}
      </pre>
    </div>
    <aside>
      <div id="detail" class="empty">Click a node to inspect rules, filters, inputs, outputs and source.</div>
    </aside>
  </main>
  <script type="application/json" id="sextant-manifest">${manifestJson}</script>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

    const manifest = JSON.parse(document.getElementById("sextant-manifest").textContent);
    const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));

    window.sextantShowNode = function sextantShowNode(id) {
      const node = nodes.get(id);
      if (!node) return;
      document.getElementById("detail").innerHTML = renderNode(node);
    };

    mermaid.initialize({
      startOnLoad: true,
      securityLevel: "loose",
      theme: "base",
      layout: "elk",
      flowchart: {
        defaultRenderer: "elk",
        htmlLabels: true,
        curve: "basis"
      },
      themeVariables: {
        background: "#fbf7ed",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        primaryColor: "#fffdf7",
        primaryBorderColor: "#d8d2c4",
        primaryTextColor: "#25211b",
        lineColor: "#8c877d",
        tertiaryColor: "#f6f2e8"
      }
    });

    function renderNode(node) {
      const details = node.details || {};
      return [
        '<div class="eyebrow">Node</div>',
        '<h2>' + escapeHtml(node.label) + '</h2>',
        '<span class="meta">' + escapeHtml(node.type) + '</span>',
        details.summary ? '<section><h3>Summary</h3><p>' + escapeHtml(details.summary) + '</p></section>' : '',
        list("Rules", details.rules),
        list("Conditions", details.conditions),
        list("Filters", details.filters),
        list("Inputs", details.inputs),
        list("Outputs", details.outputs),
        source(details.source),
        node.subflow ? '<section><h3>Subflow</h3><code>' + escapeHtml(node.subflow) + '</code></section>' : ''
      ].join("");
    }

    function list(title, values) {
      if (!values || values.length === 0) return "";
      return '<section><h3>' + title + '</h3><ul>' +
        values.map((value) => '<li><code>' + escapeHtml(value) + '</code></li>').join("") +
        '</ul></section>';
    }

    function source(value) {
      if (!value || !value.file) return "";
      const line = value.line ? ":" + value.line : "";
      return '<section><h3>Source</h3><code>' + escapeHtml(value.file + line) + '</code></section>';
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
