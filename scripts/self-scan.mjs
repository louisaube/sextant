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
    label: "CLI command router",
    file: "src/cli.js",
    entry: "main",
    output: "examples/sextant-cli.html"
  },
  {
    label: "Retrofit scanner",
    file: "src/scan/inferProcess.js",
    entry: "inferProcessFromSource",
    output: "examples/sextant-scan.html"
  },
  {
    label: "Report writer",
    file: "src/render/writeReport.js",
    entry: "writeReport",
    output: "examples/sextant-render.html"
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
    label: scan.label,
    html: output,
    source: scan.file,
    entry: scan.entry,
    mode: "scan",
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
  label: "Project overview",
  html: projectOutput,
  source: ".",
  entry: "project",
  mode: "project",
  subflowCount: await countSubflowsForReport(projectOutput)
});

console.log("Project overview: examples/sextant-project.html");

const indexFile = await writeReportIndex(reportEntries, path.join(root, "examples/index.html"), {
  title: "Sextant self-scan",
  description: "Page macro pour ouvrir les scans racines sans traverser le dossier de rapports."
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
