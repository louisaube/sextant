import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toHtml } from "./toHtml.js";
import { toMermaid } from "./toMermaid.js";

export async function writeReport(manifest, outputFile) {
  return writeReportTree(manifest, path.resolve(outputFile), new Set());
}

async function writeReportTree(manifest, target, seen) {
  const parsed = path.parse(target);
  const subflowLinks = {};
  const subflowOutputs = [];

  for (const subflow of manifest.subflows || []) {
    const id = subflow.id || slug(subflow.title || "subflow");
    const fileName = `${parsed.name}.${safeFileName(id)}.html`;
    const subflowTarget = path.join(parsed.dir, fileName);
    subflowLinks[id] = fileName;

    if (!seen.has(id)) {
      seen.add(id);
      const written = await writeReportTree(subflow, subflowTarget, seen);
      subflowOutputs.push({ id, ...written });
    }
  }

  const html = toHtml(manifest, { subflowLinks });
  const mermaid = toMermaid(manifest);
  const mermaidFile = path.join(parsed.dir, `${parsed.name}.mmd`);
  const manifestFile = path.join(parsed.dir, `${parsed.name}.workflow.json`);

  await mkdir(parsed.dir, { recursive: true });
  await writeFile(target, html, "utf8");
  await writeFile(mermaidFile, mermaid, "utf8");
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

  return {
    html: target,
    mermaid: mermaidFile,
    manifest: manifestFile,
    ...(subflowOutputs.length > 0 ? { subflows: subflowOutputs } : {})
  };
}

function safeFileName(value) {
  return slug(value).slice(0, 80) || "subflow";
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
