import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { writeReportIndex } from "../src/index.js";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "src", "cli.js");
const extraArgs = withDefaultLanguage(process.argv.slice(2));
const reportEntries = [];

if (extraArgs.includes("--llm") && !process.env.DEEPSEEK_API_KEY) {
  console.error("sextant self-scan --llm requires DEEPSEEK_API_KEY.");
  console.error("Set the key in the current shell, then run: npm run self:scan -- --llm");
  process.exit(1);
}

const scans = [
  {
    order: 2,
    label: "Comment une commande Sextant est comprise",
    description: "Montre ce qui se passe quand quelqu'un tape une commande comme scan, render ou init.",
    file: "src/cli.js",
    entry: "main",
    output: "examples/sextant-cli.html",
    mode: "commande"
  },
  {
    order: 3,
    label: "Comment Sextant lit du code existant",
    description: "C'est le moteur le plus important: il ouvre un fichier, trouve une fonction, puis transforme son flux en carte.",
    file: "src/scan/inferProcess.js",
    entry: "inferProcessFromSource",
    output: "examples/sextant-scan.html",
    mode: "moteur de scan"
  },
  {
    order: 4,
    label: "Comment Sextant ecrit les rapports",
    description: "Montre comment une carte devient trois fichiers: page HTML, diagramme Mermaid et manifest JSON.",
    file: "src/render/writeReport.js",
    entry: "writeReport",
    output: "examples/sextant-render.html",
    mode: "generation HTML"
  }
];

for (const scan of scans) {
  const args = [
    cli,
    "scan",
    path.join(root, scan.file),
    "--entry",
    scan.entry,
    ...extraArgs,
    "-o",
    path.join(root, scan.output)
  ];

  try {
    await exec(process.execPath, args, {
      cwd: root
    });
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    process.exit(error.code || 1);
  }

  const output = path.join(root, scan.output);
  const subflowCount = await countSubflowsForReport(output);
  reportEntries.push({
    order: scan.order,
    label: scan.label,
    description: scan.description,
    html: output,
    source: scan.file,
    entry: scan.entry,
    mode: scan.mode,
    subflowCount
  });

  console.log(`${scan.label}: ${scan.output}`);
}

try {
  await exec(process.execPath, [
    cli,
    "scan-project",
    root,
    ...extraArgs,
    "-o",
    path.join(root, "examples/sextant-project.html")
  ], {
    cwd: root
  });
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  process.exit(error.code || 1);
}

const projectOutput = path.join(root, "examples/sextant-project.html");
reportEntries.push({
  order: 1,
  label: "Vue globale du projet",
  description: "Commencer ici. Cette page explique les grands blocs de Sextant avant d'entrer dans une fonction precise.",
  html: projectOutput,
  source: ".",
  entry: "projet entier",
  mode: "sommaire",
  startHere: true,
  subflowCount: await countSubflowsForReport(projectOutput)
});

console.log("Vue globale du projet: examples/sextant-project.html");

const indexFile = await writeReportIndex(reportEntries, path.join(root, "examples/index.html"), {
  title: "Comprendre Sextant par ses cartes",
  description: "Un point d'entree lisible vers les rapports generes. Ouvrez d'abord la vue globale, puis descendez dans une partie seulement si vous voulez comprendre le detail."
});

console.log(`Index: ${path.relative(root, indexFile).replace(/\\/g, "/")}`);

function withDefaultLanguage(args) {
  if (args.includes("--lang") || args.includes("--language")) return args;
  return [...args, "--lang", "fr"];
}

async function countSubflowsForReport(htmlFile) {
  const manifestFile = htmlFile.replace(/\.html$/i, ".workflow.json");

  try {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    return countSubflows(manifest);
  } catch {
    return 0;
  }
}

function countSubflows(manifest) {
  return (manifest.subflows || []).reduce((total, subflow) => total + 1 + countSubflows(subflow), 0);
}
