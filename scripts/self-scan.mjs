import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "src", "cli.js");

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
    "-o",
    path.join(root, scan.output)
  ];

  await exec(process.execPath, args, {
    cwd: root
  });

  console.log(`${scan.label}: ${scan.output}`);
}
