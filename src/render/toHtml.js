import { toMermaid } from "./toMermaid.js";

const copy = {
  en: {
    tagline: "Sextant process graph. Deterministic graph first, interpretive overlay on the side.",
    llmEnriched: "LLM enriched",
    cache: "cache",
    thinking: "thinking",
    overlay: "Interpretive Overlay",
    forNonDeveloper: "For a non-developer",
    overallEffect: "Overall Effect",
    summary: "Summary",
    overlayFlow: "Overlay Flow",
    responsibilities: "Responsibilities",
    decisions: "Likely Decisions",
    assumptions: "Assumptions",
    openQuestions: "Open Questions",
    paths: "Execution Paths",
    reachedWhen: "Reached When",
    pathCondition: "Condition",
    pathOutcome: "Outcome",
    pathTerminal: "Terminal",
    pathNodes: "Nodes",
    pathAlways: "always",
    pathTruncated: "Path list truncated",
    nextFrames: "Next Frames",
    callTarget: "Call Frame",
    frameKind: "Kind",
    frameFile: "File",
    frameEntry: "Entry",
    frameSystem: "System",
    frameOperation: "Operation",
    frameReason: "Status",
    openFrame: "Open frame",
    overlayRisks: "Overlay Risks",
    deterministicWarnings: "Deterministic Warnings",
    source: "Source",
    node: "Node",
    nodeOverlay: "Overlay For A Non-Developer",
    localEffect: "Overlay Local Effect",
    rules: "Rules",
    conditions: "Conditions",
    filters: "Filters",
    inputs: "Inputs",
    outputs: "Outputs",
    overlayResponsibilities: "Overlay Responsibilities",
    subflow: "Subflow",
    codeKind: "Code Kind",
    call: "Call",
    condition: "Condition",
    snippet: "Snippet",
    suggestedSubflows: "Suggested Subflows",
    example: "Example",
    scenario: "Scenario",
    exampleInput: "Input",
    exampleOutput: "Output"
  },
  fr: {
    tagline: "Graphe de processus Sextant. Graphe deterministe d'abord, surcouche explicative sur le cote.",
    llmEnriched: "Enrichi par LLM",
    cache: "cache",
    thinking: "reflexion",
    overlay: "Surcouche explicative",
    forNonDeveloper: "Pour non-developpeur",
    overallEffect: "Effet global",
    summary: "Resume",
    overlayFlow: "Lecture expliquee",
    responsibilities: "Responsabilites",
    decisions: "Decisions probables",
    assumptions: "Hypotheses",
    openQuestions: "Questions a confirmer",
    paths: "Cas possibles",
    reachedWhen: "Atteint quand",
    pathCondition: "Condition",
    pathOutcome: "Resultat",
    pathTerminal: "Terminal",
    pathNodes: "Noeuds",
    pathAlways: "toujours",
    pathTruncated: "Liste des chemins tronquee",
    nextFrames: "Frames suivantes",
    callTarget: "Frame appelee",
    frameKind: "Type",
    frameFile: "Fichier",
    frameEntry: "Entree",
    frameSystem: "Systeme",
    frameOperation: "Operation",
    frameReason: "Statut",
    openFrame: "Ouvrir la frame",
    overlayRisks: "Risques de lecture",
    deterministicWarnings: "Alertes deterministes",
    source: "Source",
    node: "Noeud",
    nodeOverlay: "Explication du noeud",
    localEffect: "Effet local explique",
    rules: "Regles",
    conditions: "Conditions",
    filters: "Filtres",
    inputs: "Entrees",
    outputs: "Sorties",
    overlayResponsibilities: "Responsabilites expliquees",
    subflow: "Sous-flow",
    codeKind: "Type de code",
    call: "Appel",
    condition: "Condition",
    snippet: "Extrait",
    suggestedSubflows: "Sous-flows suggeres",
    example: "Exemple",
    scenario: "Scenario",
    exampleInput: "Entree",
    exampleOutput: "Sortie"
  }
};

export function toHtml(manifest, options = {}) {
  const mermaid = options.mermaid || toMermaid(manifest);
  const language = manifest.language === "fr" ? "fr" : "en";
  const text = copy[language];
  const title = escapeHtml(manifest.title || manifest.id || "Sextant");
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
  const subflowLinksJson = JSON.stringify(options.subflowLinks || {}).replace(/</g, "\\u003c");
  const llmBadge = manifest.llm?.enriched
    ? `<span class="badge">${text.llmEnriched} &middot; ${escapeHtml(manifest.llm.provider)} &middot; ${escapeHtml(manifest.llm.model)}${manifest.llm.thinking ? ` &middot; ${text.thinking} ${escapeHtml(manifest.llm.reasoningEffort || "high")}` : ""} &middot; ${text.cache} ${escapeHtml(manifest.llm.cache)}</span>`
    : "";

  return `<!doctype html>
<html lang="${language}">
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

    .path-card {
      margin: 8px 0;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #f7f0e4;
    }

    .path-card strong {
      display: block;
      margin-bottom: 6px;
    }

    .path-card p {
      margin: 4px 0;
      line-height: 1.4;
    }

    a {
      color: #8f4f16;
      font-weight: 700;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
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
    <p>${text.tagline}</p>
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
    const text = ${JSON.stringify(text).replace(/</g, "\\u003c")};
    const subflowLinks = ${subflowLinksJson};
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
        '<div class="eyebrow">' + text.overlay + '</div>',
        '<h2>' + escapeHtml(manifest.title || manifest.id || "Process") + '</h2>',
        manifest.source ? '<span class="meta">' + escapeHtml((manifest.source.mode || "process") + (manifest.source.entry ? " / " + manifest.source.entry : "")) + '</span>' : '',
        overlay.plainLanguage ? '<section><h3>' + text.forNonDeveloper + '</h3><div class="explain">' + escapeHtml(overlay.plainLanguage) + '</div></section>' : '',
        overlay.effect ? '<section><h3>' + text.overallEffect + '</h3><div class="explain">' + escapeHtml(overlay.effect) + '</div></section>' : '',
        example(overlay.example),
        paths(manifest.analysis),
        nextFrames(),
        overlay.summary ? '<section><h3>' + text.summary + '</h3><p>' + escapeHtml(overlay.summary) + '</p></section>' : '',
        list(text.overlayFlow, overlay.flow, false),
        list(text.responsibilities, overlay.responsibilities, false),
        list(text.decisions, overlay.decisions, false),
        list(text.assumptions, overlay.assumptions, false),
        list(text.openQuestions, overlay.openQuestions, false),
        list(text.overlayRisks, overlay.risks, false),
        list(text.deterministicWarnings, manifest.details?.risks, false),
        subflows(overlay.suggestedSubflows),
        manifest.source?.file ? '<section><h3>' + text.source + '</h3><code class="source">' + escapeHtml(manifest.source.file) + '</code></section>' : ''
      ].join("");
    }

    function renderNode(node) {
      const details = node.details || {};
      const nodeOverlay = overlayNodes.get(node.id) || {};
      return [
        '<div class="eyebrow">' + text.node + '</div>',
        '<h2>' + escapeHtml(node.label) + '</h2>',
        '<span class="meta">' + escapeHtml(node.type) + '</span>',
        nodeOverlay.plainLanguage ? '<section><h3>' + text.nodeOverlay + '</h3><div class="explain">' + escapeHtml(nodeOverlay.plainLanguage) + '</div></section>' : '',
        nodeOverlay.effect ? '<section><h3>' + text.localEffect + '</h3><div class="explain">' + escapeHtml(nodeOverlay.effect) + '</div></section>' : '',
        code(details.code),
        callTarget(details.callTarget, node),
        details.summary ? '<section><h3>' + text.summary + '</h3><p>' + escapeHtml(details.summary) + '</p></section>' : '',
        list(text.rules, details.rules, false),
        list(text.conditions, details.conditions, true),
        list(text.filters, details.filters, true),
        list(text.inputs, details.inputs, true),
        list(text.outputs, details.outputs, true),
        list(text.reachedWhen, reachedWhen(node.id), false),
        list(text.overlayResponsibilities, nodeOverlay.responsibilities, false),
        source(details.source),
        subflow(node)
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
        value.kind ? '<section><h3>' + text.codeKind + '</h3><span class="meta">' + escapeHtml(value.kind) + '</span></section>' : '',
        value.call ? '<section><h3>' + text.call + '</h3><code>' + escapeHtml(value.call) + '</code></section>' : '',
        value.condition ? '<section><h3>' + text.condition + '</h3><code>' + escapeHtml(value.condition) + '</code></section>' : '',
        value.snippet ? '<section><h3>' + text.snippet + '</h3><pre class="code">' + escapeHtml(value.snippet) + '</pre></section>' : ''
      ].join("");
    }

    function nextFrames() {
      const frames = manifest.nodes
        .map((node) => ({ node, target: node.details?.callTarget }))
        .filter((item) => item.target);
      if (frames.length === 0) return "";
      return '<section><h3>' + text.nextFrames + '</h3><ul>' +
        frames.map(({ node, target }) => '<li><strong>' + escapeHtml(target.kind) + '</strong> ' +
          escapeHtml(node.label) +
          (target.entry ? ' <code>' + escapeHtml(target.entry) + '</code>' : '') +
          (target.reason ? ' <span class="meta">' + escapeHtml(target.reason) + '</span>' : '') +
          '</li>').join("") +
        '</ul></section>';
    }

    function callTarget(value, node) {
      if (!value) return "";
      const link = node.subflow ? subflowLinks[node.subflow] : "";
      return '<section><h3>' + text.callTarget + '</h3>' +
        '<p><span class="meta">' + text.frameKind + '</span> ' + escapeHtml(value.kind) + '</p>' +
        (value.file ? '<p><span class="meta">' + text.frameFile + '</span> <code>' + escapeHtml(value.file) + '</code></p>' : '') +
        (value.entry ? '<p><span class="meta">' + text.frameEntry + '</span> <code>' + escapeHtml(value.entry) + '</code></p>' : '') +
        (value.system ? '<p><span class="meta">' + text.frameSystem + '</span> ' + escapeHtml(value.system) + '</p>' : '') +
        (value.operation ? '<p><span class="meta">' + text.frameOperation + '</span> <code>' + escapeHtml(value.operation) + '</code></p>' : '') +
        (value.reason ? '<p><span class="meta">' + text.frameReason + '</span> ' + escapeHtml(reasonLabel(value.reason)) + '</p>' : '') +
        (link ? '<p><a href="' + escapeHtml(link) + '">' + text.openFrame + '</a></p>' : '') +
        '</section>';
    }

    function reasonLabel(value) {
      const labels = {
        "expanded": text.openFrame,
        "depth-limit": manifest.language === "fr" ? "Frame scannable mais non developpee" : "Scannable frame not expanded",
        "cycle": manifest.language === "fr" ? "Cycle detecte" : "Cycle detected",
        "frame-cap": manifest.language === "fr" ? "Limite de frames atteinte" : "Frame limit reached",
        "opaque": manifest.language === "fr" ? "Frame opaque" : "Opaque frame",
        "unresolved": manifest.language === "fr" ? "Source non resolue" : "Unresolved source"
      };
      return labels[value] || value;
    }

    function subflows(values) {
      if (!values || values.length === 0) return "";
      return '<section><h3>' + text.suggestedSubflows + '</h3><ul>' +
        values.map((value) => '<li><strong>' + escapeHtml(value.label || value.id) + '</strong>' +
          (value.summary ? '<br>' + escapeHtml(value.summary) : '') + '</li>').join("") +
        '</ul></section>';
    }

    function paths(analysis) {
      if (!analysis || !analysis.paths || analysis.paths.length === 0) return "";
      return '<section><h3>' + text.paths + '</h3>' +
        (analysis.truncated ? '<p class="empty">' + text.pathTruncated + ' (' + escapeHtml(analysis.maxPaths) + ')</p>' : '') +
        analysis.paths.map((path) => '<div class="path-card"><strong>' + escapeHtml(path.id) + '</strong>' +
          '<p><span class="meta">' + text.pathCondition + '</span> ' + escapeHtml(path.condition && path.condition.length ? path.condition.join(' + ') : text.pathAlways) + '</p>' +
          (path.outcome ? '<p><span class="meta">' + text.pathOutcome + '</span> <code>' + escapeHtml(path.outcome) + '</code></p>' : '') +
          (path.terminal ? '<p><span class="meta">' + text.pathTerminal + '</span> <code>' + escapeHtml(path.terminal) + '</code></p>' : '') +
          '<p><span class="meta">' + text.pathNodes + '</span> ' + escapeHtml(path.nodeIds ? path.nodeIds.length : 0) + '</p>' +
        '</div>').join('') +
        '</section>';
    }

    function reachedWhen(nodeId) {
      const values = (manifest.analysis?.paths || [])
        .filter((path) => path.nodeIds && path.nodeIds.includes(nodeId))
        .map((path) => path.id + ': ' + (path.condition && path.condition.length ? path.condition.join(' + ') : text.pathAlways));
      return [...new Set(values)];
    }

    function subflow(node) {
      if (!node.subflow) return "";
      const link = subflowLinks[node.subflow];
      if (link) {
        return '<section><h3>' + text.subflow + '</h3><a href="' + escapeHtml(link) + '">' + escapeHtml(node.subflow) + '</a></section>';
      }
      return '<section><h3>' + text.subflow + '</h3><code>' + escapeHtml(node.subflow) + '</code></section>';
    }

    function example(value) {
      if (!value || (!value.scenario && !value.input && !value.output)) return "";
      return '<section><h3>' + text.example + '</h3><div class="example">' +
        (value.scenario ? '<div><strong>' + text.scenario + '</strong>' + escapeHtml(value.scenario) + '</div>' : '') +
        (value.input ? '<div><strong>' + text.exampleInput + '</strong><code>' + escapeHtml(value.input) + '</code></div>' : '') +
        (value.output ? '<div><strong>' + text.exampleOutput + '</strong>' + escapeHtml(value.output) + '</div>' : '') +
        '</div></section>';
    }

    function source(value) {
      if (!value || !value.file) return "";
      const line = value.line ? ":" + value.line : "";
      return '<section><h3>' + text.source + '</h3><code class="source">' + escapeHtml(value.file + line) + '</code></section>';
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
