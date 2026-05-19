const effectWords = [
  "send",
  "email",
  "mail",
  "notify",
  "create",
  "update",
  "delete",
  "save",
  "write",
  "persist",
  "post",
  "put",
  "patch",
  "fetch",
  "axios",
  "drive",
  "pipedrive",
  "db"
];

export function inferProcessFromSource(source, options) {
  const entry = options.entry;
  const file = options.file || "unknown";
  const language = normalizeLanguage(options.language || options.lang);
  const extracted = extractFunctionBody(source, entry);
  const lines = usefulLines(extracted.body, extracted.startLine);
  const nodes = [
    {
      id: "entry-0",
      type: "entry",
      label: entry,
      details: {
        summary: "Entry point inferred from existing code.",
        source: { file }
      }
    }
  ];
  const edges = [];
  let previous = {
    id: nodes[0].id,
    type: nodes[0].type,
    depth: -1
  };
  let pendingFalseEdges = [];
  let index = 1;

  for (const line of lines) {
    const inferred = inferLine(line);
    if (!inferred) continue;

    const node = {
      id: `${inferred.type}-${index}`,
      type: inferred.type,
      label: inferred.label,
      details: {
        summary: "Inferred from source line. Retrofit mode is approximate.",
        conditions: inferred.condition ? [inferred.condition] : [],
        filters: [],
        rules: [],
        inputs: [],
        outputs: inferred.type === "branch" ? ["yes", "no"] : [],
        code: inferred.code,
        source: {
          file,
          line: line.number
        }
      }
    };

    nodes.push(node);

    const falseEdges = pendingFalseEdges.filter((edge) => line.depth <= edge.depth);
    pendingFalseEdges = pendingFalseEdges.filter((edge) => line.depth > edge.depth);

    if (previous) {
      edges.push({
        from: previous.id,
        to: node.id,
        ...(previous.type === "branch" && line.depth > previous.depth ? { label: "yes" } : {})
      });
    }

    for (const edge of falseEdges) {
      edges.push({ from: edge.from, to: node.id, label: "no" });
    }

    if (inferred.type === "branch") {
      pendingFalseEdges.push({
        from: node.id,
        depth: line.depth
      });
    }

    previous = isTerminal(inferred.type)
      ? null
      : {
          id: node.id,
          type: inferred.type,
          depth: line.depth
        };
    index++;
  }

  return {
    id: slug(entry),
    title: entry,
    language,
    source: {
      mode: "scan",
      file,
      entry
    },
    details: {
      summary: language === "fr" ? `Scan retrofit de ${entry}.` : `Retrofit scan of ${entry}.`,
      risks: [
        language === "fr"
          ? "Le mode retrofit est approximatif : verifier les snippets et les lignes source avant de faire confiance au graphe."
          : "Retrofit mode is approximate: review snippets and source lines before trusting the graph."
      ]
    },
    overlay: buildOverlay(entry, file, nodes, language),
    nodes,
    edges,
    subflows: []
  };
}

function extractFunctionBody(source, entry) {
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(entry)}\\s*\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(entry)}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>`),
    new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(entry)}\\s*=\\s*(?:async\\s*)?[^=]*=>`)
  ];

  const match = patterns.map((pattern) => pattern.exec(source)).find(Boolean);
  if (!match) {
    throw new Error(`Could not find entry "${entry}".`);
  }

  const openIndex = source.indexOf("{", match.index);
  if (openIndex === -1) {
    throw new Error(`Entry "${entry}" does not look like a block function.`);
  }

  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      return {
        body: source.slice(openIndex + 1, index),
        startLine: lineNumberAt(source, openIndex + 1)
      };
    }
  }

  throw new Error(`Could not parse body for "${entry}".`);
}

function usefulLines(body, startLine) {
  const lines = [];
  let depth = 0;

  body.split(/\r?\n/).forEach((rawText, offset) => {
    const trimmed = rawText.replace(/\/\/.*$/, "").trim();
    const leadingClose = trimmed.match(/^\}+/)?.[0].length || 0;
    const lineDepth = Math.max(0, depth - leadingClose);
    const text = trimmed.replace(/^\}\s*/, "");
    const openCount = countChar(trimmed, "{");
    const closeCount = countChar(trimmed, "}");

    depth = Math.max(0, depth + openCount - closeCount);

    if (!text || text === "{" || text === "}") return;

    lines.push({
      number: startLine + offset,
      text,
      depth: lineDepth
    });
  });

  return lines;
}

function isTerminal(type) {
  return type === "return" || type === "error";
}

function inferLine(line) {
  const text = line.text;

  if (/^(if|else\s+if|switch)\b/.test(text)) {
    const condition = extractCondition(text);
    return {
      type: "branch",
      label: cleanDecision(text),
      condition,
      code: {
        kind: "condition",
        condition,
        snippet: snippet(text)
      }
    };
  }

  if (/^throw\b/.test(text)) {
    return {
      type: "error",
      label: compact(text),
      code: {
        kind: "throw",
        snippet: snippet(text)
      }
    };
  }

  if (/^return\b/.test(text)) {
    return {
      type: "return",
      label: compact(text),
      code: {
        kind: "return",
        snippet: snippet(text)
      }
    };
  }

  const call = firstCallName(text);
  if (!call) return null;

  return {
    type: looksLikeEffect(call, text) ? "effect" : "step",
    label: humanizeCall(call),
    call,
    code: {
      kind: "call",
      call,
      snippet: snippet(text)
    }
  };
}

function buildOverlay(entry, file, nodes, language) {
  const nodeOverlays = nodes.map((node) => explainNode(node, language));
  const flow = nodeOverlays.map((node) => node.plainLanguage).filter(Boolean);

  if (entry === "main" && nodes.some((node) => node.details?.code?.condition?.includes("command ==="))) {
    return language === "fr"
      ? {
          summary: "Routeur de commandes Sextant.",
          plainLanguage: "Quand quelqu'un tape une commande Sextant dans un terminal, ce processus decide quelle action lancer.",
          effect: "Il transforme une commande tapee en un resultat visible : aide, fichier de configuration, rapport rendu, surveillance, rapport scanne, ou erreur.",
          example: {
            scenario: "Un utilisateur veut inspecter un fichier source existant.",
            input: "sextant scan examples/legacy-classify.ts --entry classifyAttachment -o report.html",
            output: "Sextant lit le fichier, construit une carte du processus, puis ecrit report.html avec les fichiers Mermaid et manifest associes."
          },
          flow,
          risks: ["Cette surcouche explique le graphe deterministe ; faire confiance d'abord aux noeuds, aux liens, aux snippets et aux lignes source."],
          nodes: nodeOverlays
        }
      : {
          summary: "Command-line router for Sextant.",
          plainLanguage: "When someone types a Sextant command in a terminal, this process decides which action to run.",
          effect: "It turns one typed command into one visible result: help text, a config file, a rendered report, a watch process, a scanned report, or an error.",
          example: {
            scenario: "A user wants to inspect an existing source file.",
            input: "sextant scan examples/legacy-classify.ts --entry classifyAttachment -o report.html",
            output: "Sextant reads the file, builds a process map, and writes report.html plus the matching Mermaid and manifest files."
          },
          flow,
          risks: ["The overlay explains the deterministic graph; trust the nodes, edges, snippets, and source lines first."],
          nodes: nodeOverlays
        };
  }

  const effectCalls = nodes
    .filter((node) => node.type === "effect" && node.details?.code?.call)
    .map((node) => node.details.code.call);
  const returns = nodes
    .filter((node) => node.type === "return" && node.details?.code?.snippet)
    .map((node) => node.details.code.snippet);

  if (language === "fr") {
    return {
      summary: `Scan retrofit de ${entry}.`,
      plainLanguage: `Cette carte suit ce qui se passe apres l'appel a ${entry}.`,
      effect: effectCalls.length > 0
        ? `Ce processus peut modifier des sorties ou des systemes externes via : ${effectCalls.join(", ")}.`
        : "Ce processus organise surtout des decisions et des appels internes.",
      example: {
        scenario: `Quelqu'un appelle ${entry} depuis ${file}.`,
        input: `${entry}(...)`,
        output: returns.length > 0 ? returns.join(" ou ") : "Le processus atteint la derniere action visible dans le graphe."
      },
      flow,
      risks: ["Cette surcouche est explicative ; utiliser les noeuds, liens, snippets et lignes source deterministes pour corriger la carte."],
      nodes: nodeOverlays
    };
  }

  return {
    summary: `Retrofit scan of ${entry}.`,
    plainLanguage: `This map follows what happens after ${entry} is called.`,
    effect: effectCalls.length > 0
      ? `It can change external systems or outputs through: ${effectCalls.join(", ")}.`
      : "It mainly organizes decisions and internal function calls.",
    example: {
      scenario: `Someone calls ${entry} from ${file}.`,
      input: `${entry}(...)`,
      output: returns.length > 0 ? returns.join(" or ") : "The process reaches the final action shown in the graph."
    },
    flow,
    risks: ["The overlay is explanatory; use deterministic nodes, edges, snippets, and source lines to correct the map."],
    nodes: nodeOverlays
  };
}

function explainNode(node, language) {
  const code = node.details?.code || {};

  if (node.type === "entry") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: `C'est ici que le processus ${node.label} commence.`,
          effect: "Demarre le processus montre dans le graphe."
        }
      : {
          id: node.id,
          plainLanguage: `This is where the ${node.label} process starts.`,
          effect: "Starts the process shown in the graph."
        };
  }
  if (node.type === "branch") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: `Decide si cette condition est vraie : ${code.condition || node.label}.`,
          effect: "Choisit le prochain chemin du processus."
        }
      : {
          id: node.id,
          plainLanguage: `Decide whether this condition is true: ${code.condition || node.label}.`,
          effect: "Chooses which path the process follows next."
        };
  }
  if (node.type === "effect") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: `Lance ${code.call || node.label} ; cela modifie probablement quelque chose hors de la fonction courante.`,
          effect: `Effet visible ou externe probablement produit par ${code.call || node.label}.`
        }
      : {
          id: node.id,
          plainLanguage: `Run ${code.call || node.label}; this probably changes something outside the current function.`,
          effect: `Visible or external effect likely produced by ${code.call || node.label}.`
        };
  }
  if (node.type === "step") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: `Lance ${code.call || node.label} ; une partie du travail est deleguee a une autre fonction.`,
          effect: `Deplace le travail vers ${code.call || node.label}.`
        }
      : {
          id: node.id,
          plainLanguage: `Run ${code.call || node.label}; this delegates part of the work to another function.`,
          effect: `Moves work into ${code.call || node.label}.`
        };
  }
  if (node.type === "return") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: "Arrete ce chemin et renvoie un resultat a l'appelant.",
          effect: "Termine ce chemin."
        }
      : {
          id: node.id,
          plainLanguage: "Stop this path and send a result back to the caller.",
          effect: "Ends this path."
        };
  }
  if (node.type === "error") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: "Arrete ce chemin en levant une erreur.",
          effect: "Rejette ce chemin comme invalide ou non supporte."
        }
      : {
          id: node.id,
          plainLanguage: "Stop this path by raising an error.",
          effect: "Rejects this path as invalid or unsupported."
        };
  }
  return language === "fr"
    ? {
        id: node.id,
        plainLanguage: "Suit cette etape du processus.",
        effect: ""
      }
    : {
        id: node.id,
        plainLanguage: "Follow this step in the process.",
        effect: ""
      };
}

function cleanDecision(text) {
  return compact(text.replace(/\s*\{\s*$/, ""));
}

function extractCondition(text) {
  const ifMatch = /^(?:else\s+)?if\s*\((.*)\)\s*\{?$/.exec(text);
  if (ifMatch) return compact(ifMatch[1]);

  const switchMatch = /^switch\s*\((.*)\)\s*\{?$/.exec(text);
  if (switchMatch) return compact(`switch ${switchMatch[1]}`);

  return compact(text.replace(/\s*\{\s*$/, ""));
}

function firstCallName(text) {
  const match = /(?:await\s+)?([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\(/.exec(text);
  return match?.[1] || null;
}

function looksLikeEffect(call, text) {
  const value = `${call} ${text}`.toLowerCase();
  return effectWords.some((word) => value.includes(word));
}

function humanizeCall(call) {
  return call
    .split(".")
    .pop()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}

function compact(text) {
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function snippet(text) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "process";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function countChar(value, char) {
  return [...value].filter((item) => item === char).length;
}

function normalizeLanguage(value) {
  return value === "fr" ? "fr" : "en";
}
