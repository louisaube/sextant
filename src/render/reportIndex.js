import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReportIndex(reports, outputFile, options = {}) {
  const target = path.resolve(outputFile);
  const indexDir = path.dirname(target);
  const html = renderReportIndex(reports, {
    title: options.title || "Sextant reports",
    description: options.description || "Vue macro des rapports generes. Ouvrez un rapport racine, puis descendez dans ses frames depuis le panneau lateral.",
    indexDir
  });

  await mkdir(indexDir, { recursive: true });
  await writeFile(target, html, "utf8");
  return target;
}

function renderReportIndex(reports, options) {
  const cards = reports.map((report) => renderReportCard(report, options.indexDir)).join("\n");
  const count = reports.length;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fbf7ed;
      --panel: #fffdf7;
      --ink: #24201a;
      --muted: #706a60;
      --line: #ded4c3;
      --accent: #b96921;
      --accent-soft: #f4dfc9;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }

    header {
      margin-bottom: 28px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3.5rem);
      line-height: 1;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: var(--muted);
      max-width: 760px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 4px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel);
      color: var(--muted);
      font-size: 0.85rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }

    .card {
      display: grid;
      gap: 14px;
      min-height: 230px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 28px rgba(72, 52, 28, 0.06);
    }

    .card h2 {
      margin: 0;
      font-size: 1.1rem;
      letter-spacing: 0;
    }

    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      margin: 0;
      color: var(--muted);
      font-size: 0.92rem;
    }

    dt {
      color: var(--ink);
      font-weight: 650;
    }

    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    a.report-link {
      align-self: end;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 40px;
      padding: 9px 12px;
      border: 1px solid #d28b47;
      border-radius: 8px;
      background: var(--accent-soft);
      color: #47270b;
      text-decoration: none;
      font-weight: 700;
    }

    a.report-link:hover {
      border-color: var(--accent);
      background: #f0cfaa;
    }

    footer {
      margin-top: 28px;
      color: var(--muted);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(options.title)}</h1>
      <p>${escapeHtml(options.description)}</p>
      <div class="meta">
        <span class="pill">${count} rapport${count > 1 ? "s" : ""} racine${count > 1 ? "s" : ""}</span>
        <span class="pill">HTML humain seulement</span>
        <span class="pill">Artefacts techniques masques</span>
      </div>
    </header>
    <section class="grid" aria-label="Rapports racines">
      ${cards}
    </section>
    <footer>
      Les fichiers Mermaid et Manifest restent generes a cote pour les outils, mais cette page liste seulement les entrees lisibles.
    </footer>
  </main>
</body>
</html>`;
}

function renderReportCard(report, indexDir) {
  const href = relativeHref(indexDir, report.html);
  const label = report.label || report.title || path.basename(report.html || "report.html", ".html");
  const mode = report.mode || "report";
  const source = report.source || "";
  const entry = report.entry || "";
  const subflowCount = Number.isFinite(report.subflowCount) ? report.subflowCount : 0;

  return `<article class="card">
  <h2>${escapeHtml(label)}</h2>
  <dl>
    <dt>Type</dt>
    <dd>${escapeHtml(mode)}</dd>
    ${source ? `<dt>Source</dt><dd>${escapeHtml(formatPath(source))}</dd>` : ""}
    ${entry ? `<dt>Entree</dt><dd>${escapeHtml(entry)}</dd>` : ""}
    <dt>Subflows</dt>
    <dd>${subflowCount}</dd>
  </dl>
  <a class="report-link" href="${escapeAttribute(href)}">Ouvrir le rapport</a>
</article>`;
}

function relativeHref(fromDir, target) {
  if (!target) return "#";
  const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(fromDir, target);
  const relative = path.relative(fromDir, absoluteTarget) || path.basename(target);
  return formatPath(relative);
}

function formatPath(value) {
  return String(value).replace(/\\/g, "/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
