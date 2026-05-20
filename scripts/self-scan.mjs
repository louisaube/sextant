import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "src", "cli.js");
const extraArgs = withDefaultLanguage(process.argv.slice(2));

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

console.log("Project overview: examples/sextant-project.html");

function withDefaultLanguage(args) {
  if (args.includes("--lang") || args.includes("--language")) return args;
  return [...args, "--lang", "fr"];
}
