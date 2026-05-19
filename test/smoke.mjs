import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildLlmContext,
  createMockProvider,
  enrichManifestWithLlm,
  inferProcessFromSource,
  toHtml,
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
  assert.match(html, /Interpretive Overlay/);

  const legacySource = await readFile(path.join(root, "examples", "legacy-classify.ts"), "utf8");
  const inferred = inferProcessFromSource(legacySource, {
    entry: "classifyAttachment",
    file: "examples/legacy-classify.ts"
  });

  assert.equal(inferred.source.mode, "scan");
  assert.equal(inferred.nodes.some((node) => node.type === "branch"), true);
  assert.equal(inferred.nodes.some((node) => node.type === "effect"), true);
  assert.equal(inferred.edges.some((edge) => edge.from === "return-4" && edge.to === "effect-5"), false);
  assert.equal(inferred.edges.some((edge) => edge.from === "branch-2" && edge.to === "effect-5" && edge.label === "no"), true);
  assert.equal(inferred.nodes.find((node) => node.id === "effect-5").details.source.line, 9);
  assert.equal(inferred.nodes.find((node) => node.id === "branch-2").details.code.condition, "documentType.confidence < 0.85");
  assert.match(inferred.nodes.find((node) => node.id === "branch-2").details.code.snippet, /if \(documentType\.confidence/);
  assert.equal(inferred.nodes.find((node) => node.id === "branch-2").details.plainLanguage, undefined);
  assert.match(inferred.overlay.nodes.find((node) => node.id === "branch-2").plainLanguage, /Decide whether/);
  assert.match(inferred.overlay.effect, /saveToDrive/);
  assert.equal(inferred.overlay.example.input, "classifyAttachment(...)");
  const inferredHtml = toHtml(inferred);
  assert.match(inferredHtml, /For a non-developer/);
  assert.match(inferredHtml, /Overall Effect/);
  assert.equal(inferred.nodes.find((node) => node.id === "effect-5").details.code.call, "saveToDrive");
  assert.match(inferred.nodes.find((node) => node.id === "effect-5").details.code.snippet, /const driveFile = await saveToDrive/);

  const inferredFr = inferProcessFromSource(legacySource, {
    entry: "classifyAttachment",
    file: "examples/legacy-classify.ts",
    language: "fr"
  });
  const inferredFrHtml = toHtml(inferredFr);
  assert.equal(inferredFr.language, "fr");
  assert.match(inferredFr.overlay.plainLanguage, /Cette carte/);
  assert.match(inferredFrHtml, /<html lang="fr">/);
  assert.match(inferredFrHtml, /Surcouche explicative/);
  assert.match(inferredFrHtml, /Effet global/);

  const routerSource = await readFile(path.join(root, "src", "cli.js"), "utf8");
  const router = inferProcessFromSource(routerSource, {
    entry: "main",
    file: "src/cli.js"
  });

  assert.equal(router.edges.some((edge) => edge.from === "branch-1" && edge.to === "branch-4" && edge.label === "no"), true);
  assert.equal(router.edges.some((edge) => edge.from === "branch-15" && edge.to === "error-19" && edge.label === "no"), true);
  assert.equal(router.nodes.find((node) => node.id === "branch-15").label, "if (command === \"scan\")");
  assert.equal(router.nodes.find((node) => node.id === "step-17").label, "Scan File");
  assert.match(router.overlay.effect, /one typed command/);
  assert.match(router.overlay.example.output, /writes report.html/);

  const scopedContext = buildLlmContext(
    "import x from 'x';\nfunction classifyAttachment() { wantedCall(); }\nfunction unrelated() { secretCall(); }",
    inferred,
    {
      entry: "classifyAttachment",
      file: "scoped.js"
    }
  );

  assert.deepEqual(scopedContext.calls, ["classifyAttachment", "wantedCall"]);

  const provider = createMockProvider((calls) => ({
    version: 1,
    overlay: {
      summary: "Classifie une piece jointe documentaire.",
      plainLanguage: `Pour un non-dev, ce processus regarde une piece jointe et decide quoi en faire ${calls}.`,
      effect: "Il transforme une piece jointe brute en statut exploitable.",
      example: {
        scenario: "Une famille envoie un justificatif.",
        input: "attachment + deal",
        output: "categorie documentaire ou REVIEW_NEEDED"
      },
      responsibilities: ["classification documentaire"],
      flow: ["Detecter le type de document", "Envoyer en revue si la confiance est trop basse"],
      risks: ["Le scan ne suit pas encore les helpers appeles."],
      confidence: 0.9,
      nodes: [
        {
          id: "entry-0",
          summary: "Point d'entree metier enrichi par LLM.",
          responsibilities: ["classification"]
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
    }
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
  assert.deepEqual(enriched.nodes, inferred.nodes);
  assert.match(enriched.overlay.plainLanguage, /non-dev/);
  assert.equal(enriched.overlay.example.output, "categorie documentaire ou REVIEW_NEEDED");
  assert.deepEqual(enriched.overlay.flow, ["Detecter le type de document", "Envoyer en revue si la confiance est trop basse"]);
  assert.deepEqual(enriched.overlay.risks, ["Le scan ne suit pas encore les helpers appeles."]);
  assert.deepEqual(enriched.edges, inferred.edges);

  const cached = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    providerInstance: provider,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(cached.llm.cache, "hit");
  assert.deepEqual(cached.nodes, inferred.nodes);
  assert.equal(provider.calls, 1);

  await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    providerInstance: provider,
    cache: false,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(provider.calls, 2);

  const invalidProvider = createMockProvider({
    overlay: {
      nodes: [
        {
          id: "entry-0",
          label: "not allowed"
        }
      ]
    }
  });

  await assert.rejects(
    () => enrichManifestWithLlm(legacySource, inferred, {
      provider: "mock",
      model: "mock-invalid",
      providerInstance: invalidProvider,
      cacheDir: path.join(tmp, "invalid-cache")
    }),
    /not allowed/
  );

  const cachedInvalidProvider = createMockProvider({
    overlay: {
      nodes: [
        {
          id: "entry-0",
          plainLanguage: "Recovered"
        }
      ]
    }
  });

  const recovered = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-invalid",
    providerInstance: cachedInvalidProvider,
    cacheDir: path.join(tmp, "invalid-cache")
  });

  assert.equal(recovered.overlay.nodes.find((node) => node.id === "entry-0").plainLanguage, "Recovered");

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
