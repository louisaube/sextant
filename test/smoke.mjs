import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  buildLlmContext,
  createMockProvider,
  enrichManifestWithLlm,
  inferProjectFromDirectory,
  inferProcessFromSource,
  toHtml,
  toMermaid,
  workflow,
  step,
  branch,
  effect,
  writeReport
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
  const subflowHtml = await readFile(path.join(tmp, "inscription.validation-dossier.html"), "utf8");
  assert.match(html, /securityLevel: "loose"/);
  assert.match(html, /layout: "elk"/);
  assert.match(html, /sextantShowNode/);
  assert.match(html, /Interpretive Overlay/);
  assert.match(html, /inscription\.validation-dossier\.html/);
  assert.match(subflowHtml, /Validation dossier/);

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
  assert.match(inferred.nodes.find((node) => node.id === "branch-2").details.code.snippet, /documentType\.confidence/);
  assert.equal(inferred.nodes.find((node) => node.id === "branch-2").details.plainLanguage, undefined);
  assert.match(inferred.overlay.nodes.find((node) => node.id === "branch-2").plainLanguage, /Decide whether/);
  assert.match(inferred.overlay.effect, /saveToDrive/);
  assert.equal(inferred.overlay.example.input, "classifyAttachment(...)");
  assert.equal(inferred.analysis.pathCount, 2);
  assert.deepEqual(inferred.analysis.paths[0].condition, ["documentType.confidence < 0.85"]);
  assert.equal(inferred.analysis.paths[0].outcome, "return \"REVIEW_NEEDED\";");
  assert.deepEqual(inferred.analysis.paths[1].condition, ["¬(documentType.confidence < 0.85)"]);
  assert.equal(inferred.analysis.paths[1].outcome, "return documentType.category;");
  const inferredHtml = toHtml(inferred);
  assert.match(inferredHtml, /For a non-developer/);
  assert.match(inferredHtml, /Overall Effect/);
  assert.match(inferredHtml, /Execution Paths/);
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
  assert.match(inferredFrHtml, /Cas possibles/);
  assert.match(inferredFrHtml, /Atteint quand/);

  const routerSource = await readFile(path.join(root, "src", "cli.js"), "utf8");
  const router = inferProcessFromSource(routerSource, {
    entry: "main",
    file: "src/cli.js"
  });

  assert.equal(router.edges.some((edge) => edge.from === "branch-1" && edge.to === "branch-4" && edge.label === "no"), true);
  assert.equal(router.edges.some((edge) => edge.from === "branch-22" && edge.to === "error-26" && edge.label === "no"), true);
  assert.equal(router.nodes.find((node) => node.id === "branch-15").label, "if (command === \"scan\")");
  assert.equal(router.nodes.find((node) => node.id === "step-20").label, "Scan File");
  assert.match(router.overlay.effect, /one typed command/);
  assert.match(router.overlay.example.output, /writes report.html/);

  const ifElse = inferProcessFromSource("function f(){ if (a) { yesCall(); } else { noCall(); } done(); }", {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(hasEdge(ifElse, "branch-1", "step-2", "yes"), true);
  assert.equal(hasEdge(ifElse, "branch-1", "step-3", "no"), true);
  assert.equal(hasEdge(ifElse, "step-2", "step-3"), false);
  assert.equal(hasEdge(ifElse, "step-2", "step-4"), true);
  assert.equal(hasEdge(ifElse, "step-3", "step-4"), true);

  const elseIf = inferProcessFromSource("function f(){ if (a) aCall(); else if (b) bCall(); else cCall(); done(); }", {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(hasEdge(elseIf, "branch-1", "branch-3", "no"), true);
  assert.equal(hasEdge(elseIf, "branch-3", "step-4", "yes"), true);
  assert.equal(hasEdge(elseIf, "branch-3", "step-5", "no"), true);

  const switchScan = inferProcessFromSource('function f(){ switch(kind){ case "a": aCall(); break; default: dCall(); } done(); }', {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(hasEdge(switchScan, "branch-1", "step-2", 'case "a"'), true);
  assert.equal(hasEdge(switchScan, "branch-1", "step-3", "default"), true);
  assert.deepEqual(switchScan.analysis.paths.map((item) => item.condition[0]), ['kind === "a"', "default"]);

  const tryScan = inferProcessFromSource("function f(){ try { aCall(); } catch (error) { bCall(); } finally { cCall(); } done(); }", {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(hasEdge(tryScan, "branch-1", "step-2", "try"), true);
  assert.equal(hasEdge(tryScan, "branch-1", "step-3", "catch"), true);
  assert.equal(hasEdge(tryScan, "step-2", "step-4"), true);
  assert.equal(hasEdge(tryScan, "step-3", "step-4"), true);

  const loopScan = inferProcessFromSource("function f(){ while (ready) { bodyCall(); } done(); }", {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(loopScan.nodes.find((node) => node.id === "loop-1").type, "loop");
  assert.equal(hasEdge(loopScan, "loop-1", "step-2", "body"), true);
  assert.equal(hasEdge(loopScan, "step-2", "loop-1", "repeat"), true);
  assert.equal(loopScan.analysis.truncated, false);

  const braceLess = inferProcessFromSource("function f(){ if (ready) bodyCall(); done(); }", {
    entry: "f",
    file: "fixture.ts"
  });
  assert.equal(hasEdge(braceLess, "branch-1", "step-2", "yes"), true);
  assert.equal(hasEdge(braceLess, "branch-1", "step-3", "no"), true);
  assert.equal(hasEdge(braceLess, "step-2", "step-3"), true);

  const depthSource = "function root(){ normalizeLanguage(); helper(); } function normalizeLanguage(){ return 'fr'; } function helper(){ deep(); } function deep(){ return 'x'; }";
  const depth0 = inferProcessFromSource(depthSource, { entry: "root", file: path.join(tmp, "depth.ts"), depth: 0 });
  assert.equal(depth0.subflows.length, 0);
  assert.equal(depth0.nodes.find((node) => node.details?.code?.call === "normalizeLanguage").details.callTarget.reason, "depth-limit");

  const depth1 = inferProcessFromSource(depthSource, { entry: "root", file: path.join(tmp, "depth.ts"), depth: 1 });
  assert.equal(depth1.subflows.length, 2);
  assert.equal(depth1.subflows.find((flow) => flow.id === "helper").nodes.find((node) => node.details?.code?.call === "deep").details.callTarget.reason, "depth-limit");

  const depth2 = inferProcessFromSource(depthSource, { entry: "root", file: path.join(tmp, "depth.ts"), depth: 2 });
  assert.equal(depth2.subflows.find((flow) => flow.id === "helper").subflows.some((flow) => flow.id === "deep"), true);

  const cycle = inferProcessFromSource("function a(){ b(); } function b(){ a(); }", {
    entry: "a",
    file: path.join(tmp, "cycle.ts"),
    depth: 2
  });
  assert.equal(cycle.subflows[0].nodes.find((node) => node.details?.code?.call === "a").details.callTarget.reason, "cycle");

  const dataFrame = inferProcessFromSource("function saveUser(data){ prisma.user.create({ data }); }", {
    entry: "saveUser",
    file: path.join(tmp, "db.ts")
  });
  assert.equal(dataFrame.nodes.find((node) => node.details?.code?.call === "prisma.user.create").details.callTarget.kind, "data");

  const frontFrame = inferProcessFromSource("function Page(){ return <form onSubmit={handleSubmit}></form>; } function handleSubmit(){ save(); } function save(){ return true; }", {
    entry: "Page",
    file: path.join(tmp, "Page.tsx"),
    depth: 1
  });
  const handleNode = frontFrame.nodes.find((node) => node.details?.code?.call === "handleSubmit");
  assert.equal(handleNode.details.callTarget.kind, "front");
  assert.equal(handleNode.subflow, "handlesubmit");

  const routeFrame = inferProcessFromSource('function load(){ fetch("/api/users"); }', {
    entry: "load",
    file: path.join(tmp, "client.ts")
  });
  assert.equal(routeFrame.nodes.find((node) => node.details?.code?.call === "fetch").details.callTarget.kind, "route");

  await writeFile(path.join(tmp, "helper.ts"), "export function importedHelper(){ return 'ok'; }", "utf8");
  const importedFrame = inferProcessFromSource("import { importedHelper } from './helper'; function root(){ importedHelper(); }", {
    entry: "root",
    file: path.join(tmp, "root.ts"),
    depth: 1
  });
  assert.equal(importedFrame.nodes.find((node) => node.details?.code?.call === "importedHelper").details.callTarget.reason, "expanded");

  const frameHtml = toHtml(depth1);
  assert.match(frameHtml, /Next Frames/);
  assert.match(frameHtml, /Call Frame/);
  const frameFiles = await writeReport(depth1, path.join(tmp, "depth.html"));
  assert.equal(frameFiles.subflows.some((item) => item.id === "normalizelanguage"), true);
  assert.match(await readFile(path.join(tmp, "depth.html"), "utf8"), /depth\.normalizelanguage\.html/);

  const project = await inferProjectFromDirectory(root, { language: "fr" });
  const projectHtml = toHtml(project);
  assert.equal(project.source.mode, "project");
  assert.equal(project.language, "fr");
  assert.equal(project.nodes.some((node) => node.label === "Interface CLI"), true);
  assert.match(project.overlay.plainLanguage, /petite CLI/);
  assert.match(project.overlay.decisions.join("\n"), /Process Manifest/);
  assert.match(projectHtml, /Decisions probables/);

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
      decisions: ["Conserver le graphe deterministe separe de l'explication."],
      assumptions: ["Le fichier teste represente un point d'entree documentaire."],
      openQuestions: ["Quels helpers doivent devenir des sous-flows ?"],
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
    thinking: "max",
    reasoningEffort: "max",
    providerInstance: provider,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(enriched.llm.provider, "mock");
  assert.equal(enriched.llm.model, "mock-model");
  assert.equal(enriched.llm.thinking, "max");
  assert.equal(enriched.llm.reasoningEffort, "max");
  assert.equal(enriched.llm.cache, "miss");
  assert.deepEqual(enriched.nodes, inferred.nodes);
  assert.match(enriched.overlay.plainLanguage, /non-dev/);
  assert.equal(enriched.overlay.example.output, "categorie documentaire ou REVIEW_NEEDED");
  assert.deepEqual(enriched.overlay.flow, ["Detecter le type de document", "Envoyer en revue si la confiance est trop basse"]);
  assert.deepEqual(enriched.overlay.risks, ["Le scan ne suit pas encore les helpers appeles."]);
  assert.deepEqual(enriched.overlay.decisions, ["Conserver le graphe deterministe separe de l'explication."]);
  assert.deepEqual(enriched.overlay.assumptions, ["Le fichier teste represente un point d'entree documentaire."]);
  assert.deepEqual(enriched.overlay.openQuestions, ["Quels helpers doivent devenir des sous-flows ?"]);
  assert.deepEqual(enriched.edges, inferred.edges);

  const cached = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "mock-model",
    thinking: "max",
    reasoningEffort: "max",
    providerInstance: provider,
    cacheDir: path.join(tmp, "llm-cache")
  });

  assert.equal(cached.llm.cache, "hit");
  assert.deepEqual(cached.nodes, inferred.nodes);
  assert.equal(provider.calls, 1);

  const corruptProvider = createMockProvider({
    version: 1,
    overlay: {
      plainLanguage: "Recovered after corrupt cache."
    }
  });
  const corruptDir = path.join(tmp, "corrupt-cache");
  await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "corrupt-model",
    providerInstance: corruptProvider,
    cacheDir: corruptDir
  });
  const corruptFiles = await readdir(corruptDir);
  await writeFile(path.join(corruptDir, corruptFiles[0]), "{bad json", "utf8");
  const recoveredCorrupt = await enrichManifestWithLlm(legacySource, inferred, {
    provider: "mock",
    model: "corrupt-model",
    providerInstance: corruptProvider,
    cacheDir: corruptDir
  });
  assert.equal(recoveredCorrupt.llm.cache, "miss");
  assert.equal(corruptProvider.calls, 2);

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

function hasEdge(manifest, from, to, label) {
  return manifest.edges.some((edge) =>
    edge.from === from &&
    edge.to === to &&
    (label === undefined ? edge.label === undefined : edge.label === label)
  );
}
