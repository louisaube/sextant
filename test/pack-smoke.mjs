import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const tmp = await mkdtemp(path.join(os.tmpdir(), "sextant-pack-"));
const project = path.join(tmp, "consumer");
const isWindows = process.platform === "win32";

await mkdir(project, { recursive: true });

const packResult = await runCommand("npm", ["pack", "--pack-destination", tmp], {
  cwd: root
});

const tarballName = packResult.stdout
  .trim()
  .split(/\r?\n/)
  .find((line) => line.endsWith(".tgz"));

assert.ok(tarballName, "npm pack should output a tarball name");

const tarball = path.join(tmp, tarballName);

await writeFile(
  path.join(project, "package.json"),
  JSON.stringify({ type: "module", dependencies: {} }, null, 2),
  "utf8"
);

await runCommand("npm", ["install", tarball], {
  cwd: project
});

await writeFile(
  path.join(project, "workflow.js"),
  `import { workflow, step, branch, effect } from "@louis/sextant";

export const demo = workflow("Package smoke", () => {
  step("Recevoir");
  branch("OK ?", {
    yes: () => effect("Notifier"),
    no: () => effect("Rejeter")
  });
});
`,
  "utf8"
);

await runCommand(path.join(project, "node_modules", ".bin", "sextant"), [
  "render",
  path.join(project, "workflow.js"),
  "-o",
  path.join(project, "report.html")
]);

const html = await readFile(path.join(project, "report.html"), "utf8");
assert.match(html, /Package smoke/);
assert.match(html, /layout: "elk"/);

console.log(`pack smoke ok: ${tarball}`);

function runCommand(command, args, options = {}) {
  if (!isWindows) {
    return exec(command, args, options);
  }

  const commandName = command === "npm" ? "npm.cmd" : `${command}.cmd`;
  return exec("cmd.exe", ["/d", "/c", commandName, ...args], options);
}
