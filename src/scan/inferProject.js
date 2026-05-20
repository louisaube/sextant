import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirs = new Set([".git", ".sextant-cache", "node_modules", "dist", "build"]);
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md"]);

export async function inferProjectFromDirectory(rootDir, options = {}) {
  const root = path.resolve(rootDir || ".");
  const language = normalizeLanguage(options.language || options.lang);
  const files = await collectFiles(root);
  const packageJson = await readJson(path.join(root, "package.json"));
  const groups = buildGroups(root, files, packageJson);
  const nodes = buildNodes(root, groups, packageJson, language);
  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index].id,
    to: node.id
  }));

  return {
    id: slug(packageJson?.name || path.basename(root) || "project"),
    title: packageJson?.name || path.basename(root) || "Project",
    language,
    source: {
      mode: "project",
      file: root,
      entry: "project"
    },
    details: {
      summary: language === "fr" ? "Scan global macro du projet." : "Global macro scan of the project.",
      risks: [
        language === "fr"
          ? "Le scan projet est une couche de retro-engineering : il explique les choix probables, sans pretendre prouver l'intention originale."
          : "The project scan is a reverse-engineering layer: it explains likely decisions without claiming to prove original intent."
      ]
    },
    overlay: buildProjectOverlay(root, packageJson, groups, language),
    nodes,
    edges,
    subflows: []
  };
}

export async function buildProjectLlmSource(rootDir) {
  const root = path.resolve(rootDir || ".");
  const files = await collectFiles(root);
  const selected = files
    .filter((file) => shouldSendToProjectLlm(root, file))
    .slice(0, 24);
  const chunks = [];

  for (const file of selected) {
    const relative = slash(path.relative(root, file));
    const content = await readFile(file, "utf8").catch(() => "");
    chunks.push(`--- ${relative} ---\n${truncate(content, 6000)}`);
  }

  return chunks.join("\n\n");
}

async function collectFiles(root) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const relative = slash(path.relative(root, fullPath));
      if (isGeneratedArtifact(relative)) continue;
      const extension = path.extname(entry.name);
      if (!sourceExtensions.has(extension)) continue;
      files.push(fullPath);
    }
  }

  await walk(root);
  return files.sort((left, right) => slash(left).localeCompare(slash(right)));
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function buildGroups(root, files, packageJson) {
  const groups = [];
  const byPrefix = (prefix) => files.filter((file) => slash(path.relative(root, file)).startsWith(prefix));
  const docs = files.filter((file) => /^(README|DIRECTION|AGENTS|LICENSE)/i.test(path.basename(file)));

  groups.push({
    id: "package",
    label: packageJson?.name || "Package",
    kind: "package",
    files: files.filter((file) => path.basename(file) === "package.json")
  });
  groups.push({ id: "docs", label: "Vision produit", kind: "docs", files: docs });
  groups.push({ id: "cli", label: "Interface CLI", kind: "cli", files: byPrefix("src/cli") });
  groups.push({ id: "native", label: "Mode natif workflow-as-code", kind: "native", files: byPrefix("src/native/") });
  groups.push({ id: "scan", label: "Mode retrofit scan", kind: "scan", files: byPrefix("src/scan/") });
  groups.push({ id: "llm", label: "Surcouche LLM", kind: "llm", files: byPrefix("src/llm/") });
  groups.push({ id: "render", label: "Rendu HTML Mermaid", kind: "render", files: byPrefix("src/render/") });
  groups.push({ id: "examples", label: "Exemples et dogfooding", kind: "examples", files: byPrefix("examples/") });
  groups.push({ id: "tests", label: "Smoke tests package", kind: "tests", files: byPrefix("test/") });

  return groups.filter((group) => group.files.length > 0 || group.kind === "package");
}

function buildNodes(root, groups, packageJson, language) {
  const nodes = [
    {
      id: "entry-0",
      type: "entry",
      label: packageJson?.name || path.basename(root) || "Project",
      details: {
        summary: language === "fr" ? "Point de lecture globale du projet." : "Global project reading entry point.",
        source: { file: root }
      }
    }
  ];

  groups.forEach((group, index) => {
    nodes.push({
      id: `project-${index + 1}-${group.id}`,
      type: group.kind === "render" || group.kind === "llm" ? "effect" : "step",
      label: group.label,
      details: {
        summary: groupSummary(group.kind, language),
        inputs: groupInputs(group.kind, packageJson, language),
        outputs: groupOutputs(group.kind, language),
        source: {
          file: group.files[0] || root
        }
      }
    });
  });

  return nodes;
}

function buildProjectOverlay(root, packageJson, groups, language) {
  const name = packageJson?.name || path.basename(root) || "ce projet";
  const commands = Object.keys(packageJson?.scripts || {});
  const groupByKind = new Map(groups.map((group) => [group.kind, group]));
  const nodeOverlays = groups.map((group, index) => ({
    id: `project-${index + 1}-${group.id}`,
    plainLanguage: groupPlainLanguage(group.kind, language),
    effect: groupEffect(group.kind, language),
    responsibilities: [group.label]
  }));

  nodeOverlays.unshift({
    id: "entry-0",
    plainLanguage: language === "fr"
      ? `On lit ${name} comme un produit complet, pas comme une seule fonction.`
      : `Read ${name} as a full product, not as a single function.`,
    effect: language === "fr" ? "Cadre la carte globale." : "Frames the global map."
  });

  if (language === "fr") {
    return {
      summary: `Lecture globale de ${name}.`,
      plainLanguage: "Ce projet construit une petite CLI qui transforme du code en carte de processus lisible.",
      effect: "Le resultat attendu est un rapport HTML partageable : graphe deterministe au centre, explication humaine sur le cote.",
      example: {
        scenario: "Un developpeur veut comprendre un morceau de code ou montrer un processus a quelqu'un de non technique.",
        input: "sextant scan src/cli.js --entry main --lang fr",
        output: "Sextant produit un HTML avec le flux brut, les snippets source, et une explication metier separee."
      },
      responsibilities: [
        "Exposer une CLI installable",
        "Construire un Process Manifest commun",
        "Scanner du code existant en mode retrofit",
        "Ecrire des workflows en mode natif",
        "Rendre le tout en Mermaid + HTML autonome",
        "Ajouter une surcouche LLM optionnelle sans modifier le graphe"
      ],
      flow: [
        "Le package expose le binaire sextant.",
        "La CLI route la commande vers render, watch, scan ou scan-project.",
        "Le mode natif produit directement un manifest depuis les primitives workflow/step/branch/effect.",
        "Le mode retrofit lit un point d'entree et construit un graphe approximatif mais verifiable.",
        "La surcouche LLM peut expliquer le sens, mais le graphe et les snippets restent deterministes.",
        "Le renderer ecrit un HTML autonome avec Mermaid ELK."
      ],
      decisions: [
        "Rester une CLI legere plutot qu'une plateforme d'execution type Make/n8n.",
        "Mettre le Process Manifest au centre pour que native, scan, LLM et rendu parlent le meme format.",
        "Separarer strictement le graphe deterministe de la surcouche explicative pour eviter les hallucinations.",
        "Garder Mermaid + ELK avant React Flow pour tester la valeur sans dette front lourde.",
        "Limiter le scan global a une vue macro pour eviter le diagramme geant illisible.",
        groupByKind.has("llm")
          ? "Rendre le LLM opt-in : utile pour expliquer, interdit de reconstruire la verite du graphe."
          : "Reporter le LLM tant que le socle deterministe n'est pas clair."
      ],
      risks: [
        "Le sens global est retro-engineere : il doit etre relu comme hypothese, pas comme verite historique.",
        "Un scan projet ne remplace pas les scans par point d'entree pour comprendre le flux reel.",
        commands.length > 0
          ? `Les scripts npm visibles (${commands.join(", ")}) indiquent les usages prevus, mais pas tous les usages reels.`
          : "Aucun script npm visible pour confirmer les usages quotidiens."
      ],
      suggestedSubflows: groups.map((group, index) => ({
        id: group.id,
        label: group.label,
        nodeIds: [`project-${index + 1}-${group.id}`],
        summary: `${group.files.length} fichier(s) detecte(s).`
      })),
      nodes: nodeOverlays
    };
  }

  return {
    summary: `Global reading of ${name}.`,
    plainLanguage: "This project builds a small CLI that turns code into a readable process map.",
    effect: "The expected result is a shareable HTML report: deterministic graph in the center, human explanation on the side.",
    example: {
      scenario: "A developer wants to understand code or show a process to a non-technical person.",
      input: "sextant scan src/cli.js --entry main --lang en",
      output: "Sextant produces HTML with raw flow, source snippets, and a separate human explanation."
    },
    responsibilities: [
      "Expose an installable CLI",
      "Build one common Process Manifest",
      "Scan existing code in retrofit mode",
      "Write workflows in native mode",
      "Render Mermaid + standalone HTML",
      "Add optional LLM overlay without changing the graph"
    ],
    flow: [
      "The package exposes the sextant binary.",
      "The CLI routes commands to render, watch, scan, or scan-project.",
      "Native mode builds a manifest from workflow/step/branch/effect primitives.",
      "Retrofit mode reads an entry point and builds an approximate but verifiable graph.",
      "The LLM overlay can explain meaning, while graph and snippets stay deterministic.",
      "The renderer writes standalone HTML with Mermaid ELK."
    ],
    decisions: [
      "Stay a lightweight CLI instead of an execution platform like Make/n8n.",
      "Put the Process Manifest at the center so native, scan, LLM, and rendering share one format.",
      "Keep deterministic graph and interpretive overlay strictly separated to avoid hallucinations.",
      "Use Mermaid + ELK before React Flow to test value without heavy frontend debt.",
      "Keep global scans macro-level to avoid unreadable giant diagrams.",
      groupByKind.has("llm")
        ? "Make LLM opt-in: useful for explanation, forbidden from reconstructing graph truth."
        : "Defer LLM until the deterministic base is clear."
    ],
    risks: [
      "The global meaning is reverse-engineered: read it as a hypothesis, not historical truth.",
      "A project scan does not replace entry-point scans for understanding real flow.",
      commands.length > 0
        ? `Visible npm scripts (${commands.join(", ")}) indicate intended uses, but not every real use.`
        : "No visible npm scripts confirm day-to-day usage."
    ],
    suggestedSubflows: groups.map((group, index) => ({
      id: group.id,
      label: group.label,
      nodeIds: [`project-${index + 1}-${group.id}`],
      summary: `${group.files.length} detected file(s).`
    })),
    nodes: nodeOverlays
  };
}

function groupSummary(kind, language) {
  const fr = {
    package: "Declaration npm, binaire CLI et scripts.",
    docs: "Intention produit et cadrage.",
    cli: "Point d'entree commande utilisateur.",
    native: "DSL workflow-as-code.",
    scan: "Retrofit depuis code existant.",
    llm: "Surcouche explicative optionnelle.",
    render: "Transformation du manifest en Mermaid et HTML.",
    examples: "Cas de demonstration et dogfooding.",
    tests: "Verification smoke locale."
  };
  const en = {
    package: "npm declaration, CLI binary, and scripts.",
    docs: "Product intent and framing.",
    cli: "User command entry point.",
    native: "Workflow-as-code DSL.",
    scan: "Retrofit from existing code.",
    llm: "Optional explanatory overlay.",
    render: "Manifest to Mermaid and HTML.",
    examples: "Demo and dogfooding cases.",
    tests: "Local smoke verification."
  };
  return (language === "fr" ? fr : en)[kind] || kind;
}

function groupInputs(kind, packageJson, language) {
  if (kind === "package") return [packageJson?.name || "package.json"];
  if (language === "fr") {
    return {
      cli: ["Arguments terminal"],
      native: ["Code workflow structure"],
      scan: ["Fichier source + point d'entree"],
      llm: ["Manifest deterministe + snippets"],
      render: ["Process Manifest"],
      docs: ["README, DIRECTION, AGENTS"],
      examples: ["Workflows et code demo"],
      tests: ["Package local"]
    }[kind] || [];
  }
  return {
    cli: ["Terminal arguments"],
    native: ["Structured workflow code"],
    scan: ["Source file + entry point"],
    llm: ["Deterministic manifest + snippets"],
    render: ["Process Manifest"],
    docs: ["README, DIRECTION, AGENTS"],
    examples: ["Demo workflows and code"],
    tests: ["Local package"]
  }[kind] || [];
}

function groupOutputs(kind, language) {
  if (language === "fr") {
    return {
      package: ["Binaire sextant"],
      cli: ["Commande executee"],
      native: ["Manifest natif"],
      scan: ["Manifest retrofit"],
      llm: ["Overlay explicatif"],
      render: ["HTML, Mermaid, JSON"],
      docs: ["Boussole produit"],
      examples: ["Rapports regenerables"],
      tests: ["Signal smoke ok"]
    }[kind] || [];
  }
  return {
    package: ["sextant binary"],
    cli: ["Executed command"],
    native: ["Native manifest"],
    scan: ["Retrofit manifest"],
    llm: ["Explanatory overlay"],
    render: ["HTML, Mermaid, JSON"],
    docs: ["Product compass"],
    examples: ["Regenerable reports"],
    tests: ["smoke ok signal"]
  }[kind] || [];
}

function groupPlainLanguage(kind, language) {
  const fr = {
    package: "C'est l'emballage installable : nom npm, executable, scripts utiles.",
    docs: "C'est la trace de l'intention : pourquoi Sextant existe et ce qu'il refuse de devenir.",
    cli: "C'est la porte d'entree : l'utilisateur tape une commande, puis Sextant choisit le bon traitement.",
    native: "C'est la voie propre quand on ecrit un nouveau processus visualisable des le depart.",
    scan: "C'est la voie retrofit quand on arrive apres coup sur du code deja ecrit.",
    llm: "C'est le traducteur pedagogique : il explique sans toucher au graphe deterministe.",
    render: "C'est la sortie visible : Mermaid, HTML, panneau de details.",
    examples: "Ce sont les preuves locales que le produit fonctionne sur des cas concrets.",
    tests: "C'est le garde-fou minimum avant de publier ou pousser."
  };
  const en = {
    package: "This is the installable wrapper: npm name, executable, useful scripts.",
    docs: "This records the intent: why Sextant exists and what it refuses to become.",
    cli: "This is the entry door: a user types a command, then Sextant chooses the right action.",
    native: "This is the clean path when writing a new visualizable process from the start.",
    scan: "This is the retrofit path when arriving after the code already exists.",
    llm: "This is the pedagogical translator: it explains without touching deterministic graph truth.",
    render: "This is the visible output: Mermaid, HTML, detail panel.",
    examples: "These are local proofs that the product works on concrete cases.",
    tests: "This is the minimum guardrail before publishing or pushing."
  };
  return (language === "fr" ? fr : en)[kind] || kind;
}

function groupEffect(kind, language) {
  const fr = {
    package: "Permet d'installer et lancer Sextant comme une CLI.",
    docs: "Evite que le projet derive vers une plateforme trop large.",
    cli: "Transforme une intention terminal en action Sextant.",
    native: "Produit un graphe fiable parce que le code est ecrit comme processus.",
    scan: "Produit une premiere carte verifiable depuis du code libre.",
    llm: "Ajoute le sens humain, les risques et les decisions probables.",
    render: "Fabrique le rapport que l'on peut ouvrir et partager.",
    examples: "Montre le rendu sans dependance a un vrai projet client.",
    tests: "Bloque les regressions grossieres."
  };
  const en = {
    package: "Lets Sextant be installed and run as a CLI.",
    docs: "Prevents the project from drifting into a too-broad platform.",
    cli: "Turns terminal intent into a Sextant action.",
    native: "Produces a reliable graph because the code is written as a process.",
    scan: "Produces a first verifiable map from free-form code.",
    llm: "Adds human meaning, risks, and likely decisions.",
    render: "Builds the report people can open and share.",
    examples: "Shows rendering without depending on a real client project.",
    tests: "Blocks coarse regressions."
  };
  return (language === "fr" ? fr : en)[kind] || "";
}

function shouldSendToProjectLlm(root, file) {
  const relative = slash(path.relative(root, file));
  if (isGeneratedArtifact(relative)) return false;
  if (/^(README|DIRECTION|AGENTS|package\.json)/i.test(relative)) return true;
  if (relative.startsWith("src/")) return true;
  if (relative.startsWith("scripts/")) return true;
  if (relative.startsWith("examples/") && !/\.(html|mmd|workflow\.json)$/.test(relative)) return true;
  if (relative.startsWith("test/")) return true;
  return false;
}

function isGeneratedArtifact(relative) {
  return /\.(html|mmd|workflow\.json)$/.test(relative);
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max)}\n... [truncated]` : value;
}

function slash(value) {
  return value.replace(/\\/g, "/");
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";
}

function normalizeLanguage(value) {
  return value === "fr" ? "fr" : "en";
}
