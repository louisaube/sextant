import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toHtml } from "./toHtml.js";
import { toMermaid } from "./toMermaid.js";

export async function writeReport(manifest, outputFile) {
  const html = toHtml(manifest);
  const mermaid = toMermaid(manifest);
  const target = path.resolve(outputFile);
  const parsed = path.parse(target);
  const mermaidFile = path.join(parsed.dir, `${parsed.name}.mmd`);
  const manifestFile = path.join(parsed.dir, `${parsed.name}.workflow.json`);

  await mkdir(parsed.dir, { recursive: true });
  await writeFile(target, html, "utf8");
  await writeFile(mermaidFile, mermaid, "utf8");
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2), "utf8");

  return {
    html: target,
    mermaid: mermaidFile,
    manifest: manifestFile
  };
}
