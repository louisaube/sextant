import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReportIndex(reports, outputFile, options = {}) {
  const target = path.resolve(outputFile);
  const indexDir = path.dirname(target);
  const html = renderReportIndex(reports, {
    title: options.title || "Sextant reports",
    description: options.description || "Un point d'entree lisible vers les rapports generes. Commencez par la vue globale, puis ouvrez une partie precise si necessaire.",
    indexDir
  });

  await mkdir(indexDir, { recursive: true });
  await writeFile(target, html, "utf8");
  return target;
}

function renderReportIndex(reports, options) {
  const orderedReports = [...reports].sort((left, right) => (left.order || 0) - (right.order || 0));
  const cards = orderedReports.map((report) => renderReportCard(report, options.indexDir)).join("\n");
  const guide = renderGuide(orderedReports, options.indexDir);
  const count = orderedReports.length;

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

    .guide {
      display: grid;
      gap: 14px;
      margin: 0 0 18px;
      padding: 18px;
      border: 1px solid #d28b47;
      border-radius: 8px;
      background: #fff4e5;
    }

    .guide h2 {
      margin: 0;
      font-size: 1.15rem;
      letter-spacing: 0;
    }

    .guide ol {
      margin: 0;
      padding-left: 22px;
      color: var(--muted);
    }

    .guide li + li {
      margin-top: 6px;
    }

    .card {
      display: grid;
      gap: 14px;
      min-height: 260px;
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

    .card p {
      font-size: 0.95rem;
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
        <span class="pill">${count} porte${count > 1 ? "s" : ""} d'entree</span>
        <span class="pill">Details au clic</span>
        <span class="pill">Fichiers techniques caches</span>
      </div>
    </header>
    ${guide}
    <section class="grid" aria-label="Rapports racines">
      ${cards}
    </section>
    <footer>
      Ignorez les fichiers .mmd et .workflow.json sauf si vous debuggez Sextant. Ils restent disponibles pour les outils, mais cette page liste seulement les entrees utiles a lire.
    </footer>
  </main>
</body>
</html>`;
}

function renderReportCard(report, indexDir) {
  const href = relativeHref(indexDir, report.html);
  const label = report.label || report.title || path.basename(report.html || "report.html", ".html");
  const description = report.description || "Carte racine generee par Sextant.";
  const mode = report.mode || "rapport";
  const source = report.source || "";
  const entry = report.entry || "";
  const subflowCount = Number.isFinite(report.subflowCount) ? report.subflowCount : 0;

  return `<article class="card">
  <h2>${escapeHtml(label)}</h2>
  <p>${escapeHtml(description)}</p>
  <dl>
    <dt>Nature</dt>
    <dd>${escapeHtml(mode)}</dd>
    ${source ? `<dt>Code lu</dt><dd>${escapeHtml(formatPath(source))}</dd>` : ""}
    ${entry ? `<dt>Depart</dt><dd>${escapeHtml(entry)}</dd>` : ""}
    <dt>Pages internes</dt>
    <dd>${subflowCount}</dd>
  </dl>
  <a class="report-link" href="${escapeAttribute(href)}">Ouvrir cette carte</a>
</article>`;
}

function renderGuide(reports, indexDir) {
  const startReport = reports.find((report) => report.startHere) || reports[0];
  const startHref = startReport ? relativeHref(indexDir, startReport.html) : "#";

  return `<section class="guide" aria-label="Parcours conseille">
  <h2>Par ou commencer</h2>
  <ol>
    <li><a href="${escapeAttribute(startHref)}">Ouvrir ${escapeHtml(startReport?.label || "la premiere carte")}</a> pour comprendre le role global du projet.</li>
    <li>Ouvrir ensuite une carte precise seulement si une question se pose: commande, scan du code, ou generation du rapport.</li>
    <li>Dans une carte, utiliser les pages internes pour descendre dans une fonction appelee.</li>
  </ol>
</section>`;
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
