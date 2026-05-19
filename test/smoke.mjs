import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createMockProvider,
  enrichManifestWithLlm,
  inferProcessFromSource,
  toMermaid,
  workflow,
  step,
  branch,
  effect
} from "../src/index.js";

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const tmp = await mkdtemp(path.join(os.tmpdir(), "sextant-smoke-"));

try {
  const manifest = workflow("Smoke workflow", () => {
    step("Recevoir demande", {
      inputs: ["request"]
    });

    branch("Valide ?", {
      conditions: ["request.valid === true"],
      yes: () => {
        effect("Notifier equipe", {
          outputs: ["email.sent"]
        });
      },
      no: () => {
        effect("Rejeter demande");
      }
    });
  });

  assert.equal(manifest.title, "Smoke workflow");
  assert.equal(manifest.nodes.some((node) => node.type === "branch"), true);
  assert.equal(manifest.nodes.some((node) => node.type === "effect"), true);

  const mermaid = toMermaid(manifest);
  assert.match(mermaid, /layout: elk/);
  assert.match(mermaid, /click .*sextantShowNode/);

  await exec(process.execPath, [
    path.join(root, "src", "cli.js"),
    "render",
    path.join(root, "examples", "inscription.workflow.js"),
    "-o",
    path.join(tmp, "inscription.html")
  ]);

  const html = await readFile(path.join(tmp, "inscription.html"), "utf8");
  assert.match(html, /securityLevel: "loose"/);
  assert.match(html, /layout: "elk"/);
  assert.match(html, /sextantShowNode/);

  const legacySource = await readFile(path.join(root, "examples", "legacy-classify.ts"), "utf8");
  const inferred = inferProcessFromSource(legacySource, {
    entry: "classifyAttachment",
    file: "examples/legacy-classify.ts"
  });

  assert.equal(inferred.source.mode, "scan");
  assert.equal(inferred.nodes.some((node) => node.type === "branch"), true);
  assert.equal(inferred.nodes.some((node) => node.type === "effect"), true);

  const provider = createMockProvider((calls) => ({
    version: 1,
    process: {
      summary: "Classifie une piece jointe documentaire.",
      responsibilities: ["classification documentaire"],
      confidence: 0.9
    },
    nodes: [
      {
        id: "entry-0",
        label: `Classer piece jointe ${calls}`,
        details: {
          summary: "Point d'entree metier enrichi par LLM.",
          responsibilities: ["classification"]
        }
      }
    ],
    suggestedSubflows: [
      {
        id: "classification",
        label: "Classification",
        nodeIds: ["entry-0"],
        summary: "Regroupe le debut du traitement documentaire."
      }
    ]
  }));

  const enriched = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    providerInstance: provider,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(enriched.llm.provider, "mock");
  assert.equal(enriched.llm.model, "mock-model");
  assert.equal(enriched.llm.cache, "miss");
  assert.equal(enriched.nodes[0].label, "Classer piece jointe 1");
  assert.deepEqual(enriched.edges, inferred.edges);

  const cached = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    providerInstance: provider,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(cached.llm.cache, "hit");
  assert.equal(cached.nodes[0].label, "Classer piece jointe 1");
  assert.equal(provider.calls, 1);

  await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    providerInstance: provider,
    cache: false,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(provider.calls, 2);

  const { stderr } = await exec(process.execPath, [
    path.join(root, "src", "cli.js"),
    "scan",
    path.join(root, "examples", "legacy-classify.ts"),
    "--entry",
    "classifyAttachment",
    "--llm",
    "-o",
    path.join(tmp, "llm.html")
  ], {
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: ""
    }
  }).then(
    () => ({ stderr: "" }),
    (error) => ({ stderr: error.stderr || "" })
  );

  assert.match(stderr, /DEEPSEEK_API_KEY/);

  console.log("smoke ok");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
