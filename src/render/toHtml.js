import { toMermaid } from "./toMermaid.js";

export function toHtml(manifest, options = {}) {
  const mermaid = options.mermaid || toMermaid(manifest);
  const title = escapeHtml(manifest.title || manifest.id || "Sextant");
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
  const llmBadge = manifest.llm?.enriched
    ? `<span class="badge">LLM enriched &middot; ${escapeHtml(manifest.llm.provider)} &middot; ${escapeHtml(manifest.llm.model)} &middot; cache ${escapeHtml(manifest.llm.cache)}</span>`
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
      grid-template-columns: minmax(0, 1fr) 420px;
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

    .explain {
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff8ea;
      line-height: 1.5;
    }

    .example {
      display: grid;
      gap: 10px;
    }

    .example div {
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f7f0e4;
    }

    .example strong {
      display: block;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
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

    pre.code {
      margin: 0;
      overflow: auto;
      white-space: pre-wrap;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f7f0e4;
      color: #35291c;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
    }

    .source {
      word-break: break-word;
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
    <p>Sextant process graph. Deterministic graph first, interpretive overlay on the side.</p>
    ${llmBadge}
  </header>
  <main>
    <div class="graph">
      <pre class="mermaid">
${escapeHtml(mermaid)}
      </pre>
    </div>
    <aside>
      <div id="detail"></div>
    </aside>
  </main>
  <script type="application/json" id="sextant-manifest">${manifestJson}</script>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

    const manifest = JSON.parse(document.getElementById("sextant-manifest").textContent);
    const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
    const overlay = manifest.overlay || {};
    const overlayNodes = new Map((overlay.nodes || []).map((node) => [node.id, node]));
    document.getElementById("detail").innerHTML = renderOverview();

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

    function renderOverview() {
      return [
        '<div class="eyebrow">Interpretive Overlay</div>',
        '<h2>' + escapeHtml(manifest.title || manifest.id || "Process") + '</h2>',
        manifest.source ? '<span class="meta">' + escapeHtml((manifest.source.mode || "process") + (manifest.source.entry ? " / " + manifest.source.entry : "")) + '</span>' : '',
        overlay.plainLanguage ? '<section><h3>For a non-developer</h3><div class="explain">' + escapeHtml(overlay.plainLanguage) + '</div></section>' : '',
        overlay.effect ? '<section><h3>Overall Effect</h3><div class="explain">' + escapeHtml(overlay.effect) + '</div></section>' : '',
        example(overlay.example),
        overlay.summary ? '<section><h3>Summary</h3><p>' + escapeHtml(overlay.summary) + '</p></section>' : '',
        list("Overlay Flow", overlay.flow, false),
        list("Responsibilities", overlay.responsibilities, false),
        list("Overlay Risks", overlay.risks, false),
        list("Deterministic Warnings", manifest.details?.risks, false),
        subflows(overlay.suggestedSubflows),
        manifest.source?.file ? '<section><h3>Source</h3><code class="source">' + escapeHtml(manifest.source.file) + '</code></section>' : ''
      ].join("");
    }

    function renderNode(node) {
      const details = node.details || {};
      const nodeOverlay = overlayNodes.get(node.id) || {};
      return [
        '<div class="eyebrow">Node</div>',
        '<h2>' + escapeHtml(node.label) + '</h2>',
        '<span class="meta">' + escapeHtml(node.type) + '</span>',
        nodeOverlay.plainLanguage ? '<section><h3>Overlay For A Non-Developer</h3><div class="explain">' + escapeHtml(nodeOverlay.plainLanguage) + '</div></section>' : '',
        nodeOverlay.effect ? '<section><h3>Overlay Local Effect</h3><div class="explain">' + escapeHtml(nodeOverlay.effect) + '</div></section>' : '',
        code(details.code),
        details.summary ? '<section><h3>Summary</h3><p>' + escapeHtml(details.summary) + '</p></section>' : '',
        list("Rules", details.rules, false),
        list("Conditions", details.conditions, true),
        list("Filters", details.filters, true),
        list("Inputs", details.inputs, true),
        list("Outputs", details.outputs, true),
        list("Overlay Responsibilities", nodeOverlay.responsibilities, false),
        source(details.source),
        node.subflow ? '<section><h3>Subflow</h3><code>' + escapeHtml(node.subflow) + '</code></section>' : ''
      ].join("");
    }

    function list(title, values, asCode) {
      if (!values || values.length === 0) return "";
      return '<section><h3>' + title + '</h3><ul>' +
        values.map((value) => '<li>' + (asCode ? '<code>' : '') + escapeHtml(value) + (asCode ? '</code>' : '') + '</li>').join("") +
        '</ul></section>';
    }

    function code(value) {
      if (!value || (!value.snippet && !value.call && !value.condition)) return "";
      return [
        value.kind ? '<section><h3>Code Kind</h3><span class="meta">' + escapeHtml(value.kind) + '</span></section>' : '',
        value.call ? '<section><h3>Call</h3><code>' + escapeHtml(value.call) + '</code></section>' : '',
        value.condition ? '<section><h3>Condition</h3><code>' + escapeHtml(value.condition) + '</code></section>' : '',
        value.snippet ? '<section><h3>Snippet</h3><pre class="code">' + escapeHtml(value.snippet) + '</pre></section>' : ''
      ].join("");
    }

    function subflows(values) {
      if (!values || values.length === 0) return "";
      return '<section><h3>Suggested Subflows</h3><ul>' +
        values.map((value) => '<li><strong>' + escapeHtml(value.label || value.id) + '</strong>' +
          (value.summary ? '<br>' + escapeHtml(value.summary) : '') + '</li>').join("") +
        '</ul></section>';
    }

    function example(value) {
      if (!value || (!value.scenario && !value.input && !value.output)) return "";
      return '<section><h3>Example</h3><div class="example">' +
        (value.scenario ? '<div><strong>Scenario</strong>' + escapeHtml(value.scenario) + '</div>' : '') +
        (value.input ? '<div><strong>Input</strong><code>' + escapeHtml(value.input) + '</code></div>' : '') +
        (value.output ? '<div><strong>Output</strong>' + escapeHtml(value.output) + '</div>' : '') +
        '</div></section>';
    }

    function source(value) {
      if (!value || !value.file) return "";
      const line = value.line ? ":" + value.line : "";
      return '<section><h3>Source</h3><code class="source">' + escapeHtml(value.file + line) + '</code></section>';
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
