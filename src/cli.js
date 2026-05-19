#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getCurrentWorkflow } from "./index.js";
import { inferProcessFromSource } from "./scan/inferProcess.js";
import { writeReport } from "./render/writeReport.js";

const command = process.argv[2];

main().catch((error) => {
  console.error(`sextant: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await initProject();
    return;
  }

  if (command === "render") {
    const args = parseArgs(process.argv.slice(3));
    await renderFile(args);
    return;
  }

  if (command === "watch") {
    const args = parseArgs(process.argv.slice(3));
    await watchFile(args);
    return;
  }

  if (command === "scan") {
    const args = parseArgs(process.argv.slice(3));
    await scanFile(args);
    return;
  }

  throw new Error(`Unknown command "${command}".`);
}

async function initProject() {
  const configFile = path.resolve("sextant.config.json");
  if (existsSync(configFile)) {
    console.log("sextant.config.json already exists");
    return;
  }

  await writeFile(
    configFile,
    JSON.stringify(
      {
        maxNodesPerView: 25,
        renderer: "mermaid-elk",
        theme: "claude-light"
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`created ${configFile}`);
}

async function renderFile(args) {
  const input = args._[0];
  if (!input) throw new Error("render expects a workflow file.");

  const output = args.o || args.output || defaultOutput(input);
  const manifest = await loadWorkflow(input);
  const files = await writeReport(manifest, output);
  console.log(`wrote ${files.html}`);
}

async function watchFile(args) {
  const input = args._[0];
  if (!input) throw new Error("watch expects a workflow file.");

  await renderFile(args);
  console.log(`watching ${path.resolve(input)}`);

  let running = false;
  let timer = null;

  const fs = await import("node:fs");
  fs.watch(input, { persistent: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        await renderFile(args);
      } catch (error) {
        console.error(`sextant: ${error.message}`);
      } finally {
        running = false;
      }
    }, 100);
  });
}

async function scanFile(args) {
  const input = args._[0];
  const entry = args.entry || args.function;
  if (!input) throw new Error("scan expects a source file.");
  if (!entry) throw new Error("scan expects --entry <name>.");

  const file = path.resolve(input);
  const source = await readFile(file, "utf8");
  const manifest = inferProcessFromSource(source, { entry, file });
  const output = args.o || args.output || defaultOutput(input);
  const files = await writeReport(manifest, output);
  console.log(`wrote ${files.html}`);
}

async function loadWorkflow(file) {
  const resolved = path.resolve(file);
  const extension = path.extname(resolved);
  const moduleUrl =
    extension === ".ts" || extension === ".tsx"
      ? await transpileWorkflow(resolved)
      : `${pathToFileURL(resolved).href}?t=${Date.now()}`;

  const imported = await import(moduleUrl);
  const exported = Object.values(imported).find(isManifest);
  const current = getCurrentWorkflow();

  if (exported) return exported;
  if (isManifest(current)) return current;

  throw new Error(`No Sextant workflow exported by ${file}.`);
}

async function transpileWorkflow(file) {
  let ts;
  try {
    ts = await import("typescript");
  } catch {
    throw new Error("Rendering .ts workflows requires the optional dependency \"typescript\".");
  }

  const source = await readFile(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;

  const cacheDir = path.resolve(".sextant-cache");
  await mkdir(cacheDir, { recursive: true });
  const target = path.join(cacheDir, `${path.basename(file)}.${Date.now()}.mjs`);
  await writeFile(target, output, "utf8");
  return pathToFileURL(target).href;
}

function isManifest(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray(value.nodes) &&
      Array.isArray(value.edges)
  );
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "-o" || value === "--output") {
      parsed.output = argv[++index];
      parsed.o = parsed.output;
    } else if (value === "--entry" || value === "--function") {
      parsed.entry = argv[++index];
    } else if (value.startsWith("--")) {
      parsed[value.slice(2)] = argv[++index] || true;
    } else {
      parsed._.push(value);
    }
  }

  return parsed;
}

function defaultOutput(input) {
  const parsed = path.parse(input);
  return path.join(parsed.dir, `${parsed.name}.html`);
}

function printHelp() {
  console.log(`Sextant

Usage:
  sextant init
  sextant render <workflow.ts|workflow.js> -o <report.html>
  sextant watch <workflow.ts|workflow.js> -o <report.html>
  sextant scan <file.ts|file.js> --entry <name> -o <report.html>
`);
}
