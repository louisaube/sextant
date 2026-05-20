import ts from "typescript";

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

const defaultMaxPaths = 64;

export function inferProcessFromSource(source, options) {
  const entry = options.entry;
  const file = options.file || "unknown";
  const language = normalizeLanguage(options.language || options.lang);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file)
  );
  const entryNode = findEntry(sourceFile, entry);
  const builder = new AstProcessBuilder(sourceFile, file, entry, language);
  const body = entryNode.body;

  if (!body || !ts.isBlock(body)) {
    throw new Error(`Entry "${entry}" does not look like a block function.`);
  }

  builder.emitStatements(body.statements, [builder.entryCursor]);
  const nodes = builder.nodes;
  const edges = builder.edges;

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
          ? "Le mode retrofit est approximatif : verifier les snippets, les chemins et les lignes source avant de faire confiance au graphe."
          : "Retrofit mode is approximate: review snippets, paths, and source lines before trusting the graph."
      ]
    },
    overlay: buildOverlay(entry, file, nodes, language),
    analysis: buildAnalysis(nodes, edges, { maxPaths: defaultMaxPaths }),
    nodes,
    edges,
    subflows: []
  };
}

class AstProcessBuilder {
  constructor(sourceFile, file, entry, language) {
    this.sourceFile = sourceFile;
    this.file = file;
    this.entry = entry;
    this.language = language;
    this.nodes = [];
    this.edges = [];
    this.index = 0;
    this.entryNode = this.createNode("entry", entry, sourceFile, {
      summary: "Entry point inferred from existing code."
    });
    this.entryCursor = { nodeId: this.entryNode.id };
  }

  emitStatements(statements, cursors) {
    let current = cursors;

    for (const statement of statements) {
      if (current.length === 0) break;
      current = this.emitStatement(statement, current);
    }

    return current;
  }

  emitStatement(statement, cursors) {
    if (ts.isBlock(statement)) {
      return this.emitStatements(statement.statements, cursors);
    }

    if (ts.isIfStatement(statement)) return this.emitIf(statement, cursors);
    if (ts.isSwitchStatement(statement)) return this.emitSwitch(statement, cursors);
    if (ts.isTryStatement(statement)) return this.emitTry(statement, cursors);
    if (isLoop(statement)) return this.emitLoop(statement, cursors);
    if (ts.isReturnStatement(statement)) return this.emitReturn(statement, cursors);
    if (ts.isThrowStatement(statement)) return this.emitThrow(statement, cursors);

    if (!ts.isExpressionStatement(statement) && !ts.isVariableStatement(statement)) return cursors;

    const call = firstCall(statement);
    if (!call) return cursors;

    const callee = call.expression.getText(this.sourceFile);
    const node = this.createNode(
      looksLikeEffect(callee, statement.getText(this.sourceFile)) ? "effect" : "step",
      humanizeCall(callee),
      statement,
      {
        summary: "Inferred from AST statement. Retrofit mode is approximate.",
        code: {
          kind: "call",
          call: callee,
          snippet: snippet(statement.getText(this.sourceFile))
        }
      }
    );
    this.connect(cursors, node.id);
    return [{ nodeId: node.id }];
  }

  emitIf(statement, cursors) {
    const condition = cleanText(statement.expression.getText(this.sourceFile));
    const branch = this.createNode("branch", compact(`if (${condition})`), statement.expression, {
      summary: "Inferred from AST if statement. Retrofit mode is approximate.",
      conditions: [condition],
      outputs: ["yes", "no"],
      code: {
        kind: "condition",
        condition,
        snippet: snippet(statement.expression.getText(this.sourceFile))
      }
    });

    this.connect(cursors, branch.id);

    const thenOut = this.emitStatement(statement.thenStatement, [{ nodeId: branch.id, label: "yes" }]);
    const elseOut = statement.elseStatement
      ? this.emitStatement(statement.elseStatement, [{ nodeId: branch.id, label: "no" }])
      : [{ nodeId: branch.id, label: "no" }];

    return [...thenOut, ...elseOut];
  }

  emitSwitch(statement, cursors) {
    const expression = cleanText(statement.expression.getText(this.sourceFile));
    const branch = this.createNode("branch", compact(`switch (${expression})`), statement.expression, {
      summary: "Inferred from AST switch statement. Retrofit mode is approximate.",
      conditions: [expression],
      outputs: statement.caseBlock.clauses.map((clause) => caseLabel(clause, this.sourceFile)),
      code: {
        kind: "condition",
        condition: expression,
        snippet: snippet(statement.expression.getText(this.sourceFile))
      }
    });
    const outs = [];
    let hasDefault = false;

    this.connect(cursors, branch.id);

    for (const clause of statement.caseBlock.clauses) {
      const label = caseLabel(clause, this.sourceFile);
      if (label === "default") hasDefault = true;
      const armOut = clause.statements.length > 0
        ? this.emitStatements(clause.statements, [{ nodeId: branch.id, label }])
        : [{ nodeId: branch.id, label }];
      outs.push(...armOut);
    }

    if (!hasDefault) outs.push({ nodeId: branch.id, label: "default" });
    return outs;
  }

  emitTry(statement, cursors) {
    const outputs = statement.catchClause ? ["try", "catch"] : ["try"];
    const branch = this.createNode("branch", "try", statement, {
      summary: "Inferred from AST try/catch statement. Retrofit mode is approximate.",
      outputs,
      code: {
        kind: "condition",
        condition: "try",
        snippet: snippet("try")
      }
    });
    this.connect(cursors, branch.id);

    const tryOut = this.emitStatements(statement.tryBlock.statements, [{ nodeId: branch.id, label: "try" }]);
    const catchOut = statement.catchClause
      ? this.emitStatement(statement.catchClause.block, [{ nodeId: branch.id, label: "catch" }])
      : [];
    const combined = [...tryOut, ...catchOut];

    return statement.finallyBlock ? this.emitStatements(statement.finallyBlock.statements, combined) : combined;
  }

  emitLoop(statement, cursors) {
    const condition = loopCondition(statement, this.sourceFile);
    const loop = this.createNode("loop", compact(loopLabel(statement, this.sourceFile)), statement, {
      summary: "Inferred from AST loop statement. Paths traverse the loop body at most once.",
      conditions: condition ? [condition] : [],
      outputs: ["body", "exit"],
      code: {
        kind: "condition",
        condition,
        snippet: snippet(statement.getText(this.sourceFile))
      }
    });

    this.connect(cursors, loop.id);
    const bodyOut = this.emitStatement(statement.statement, [{ nodeId: loop.id, label: "body" }]);

    for (const cursor of bodyOut) {
      this.addEdge(cursor.nodeId, loop.id, "repeat");
    }

    return [
      { nodeId: loop.id, label: "exit" },
      ...bodyOut.map((cursor) => ({ nodeId: cursor.nodeId, label: "exit" }))
    ];
  }

  emitReturn(statement, cursors) {
    const text = statement.getText(this.sourceFile);
    const node = this.createNode("return", compact(text), statement, {
      summary: "Inferred from AST return statement. Retrofit mode is approximate.",
      code: {
        kind: "return",
        snippet: snippet(text)
      }
    });
    this.connect(cursors, node.id);
    return [];
  }

  emitThrow(statement, cursors) {
    const text = statement.getText(this.sourceFile);
    const node = this.createNode("error", compact(text), statement, {
      summary: "Inferred from AST throw statement. Retrofit mode is approximate.",
      code: {
        kind: "throw",
        snippet: snippet(text)
      }
    });
    this.connect(cursors, node.id);
    return [];
  }

  createNode(type, label, astNode, details = {}, extra = {}) {
    const id = `${type}-${this.index++}`;
    const node = {
      id,
      type,
      label: label || type,
      details: normalizeDetails({
        summary: "Inferred from AST node. Retrofit mode is approximate.",
        ...details,
        source: {
          file: this.file,
          line: lineNumber(this.sourceFile, astNode)
        }
      }),
      ...extra
    };
    this.nodes.push(node);
    return node;
  }

  connect(cursors, to) {
    for (const cursor of cursors) {
      this.addEdge(cursor.nodeId, to, cursor.label);
    }
  }

  addEdge(from, to, label) {
    if (!from || !to) return;
    if (this.edges.some((edge) => edge.from === from && edge.to === to && edge.label === label)) return;
    this.edges.push({
      from,
      to,
      ...(label ? { label } : {})
    });
  }
}

function findEntry(sourceFile, entry) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === entry) return statement;

    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== entry) continue;
      if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
        return declaration.initializer;
      }
    }
  }

  throw new Error(`Could not find entry "${entry}".`);
}

function buildAnalysis(nodes, edges, options = {}) {
  const maxPaths = options.maxPaths || defaultMaxPaths;
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  const paths = [];
  let truncated = false;

  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }

  dfs("entry-0", [], []);

  return {
    paths,
    pathCount: paths.length,
    truncated,
    maxPaths
  };

  function dfs(nodeId, path, conditions) {
    if (paths.length >= maxPaths) {
      truncated = true;
      return;
    }

    if (path.includes(nodeId)) return;

    const node = nodeMap.get(nodeId);
    if (!node) return;

    const nextPath = [...path, nodeId];
    const nextEdges = (outgoing.get(nodeId) || []).filter((edge) => edge.label !== "repeat");

    if (isTerminalNode(node) || nextEdges.length === 0) {
      paths.push({
        id: `path-${paths.length + 1}`,
        nodeIds: nextPath,
        condition: conditions,
        terminal: nodeId,
        outcome: outcome(node)
      });
      return;
    }

    for (const edge of nextEdges) {
      dfs(edge.to, nextPath, [...conditions, ...conditionsForEdge(edge, node)]);
    }
  }
}

function conditionsForEdge(edge, node) {
  const label = edge.label;
  const condition = node.details?.code?.condition || node.details?.conditions?.[0];

  if (!label) return [];
  if (node.type === "loop") {
    if (label === "body") return condition ? [condition] : [];
    if (label === "exit") return condition ? [`\u00ac(${condition})`] : [];
    return [];
  }
  if (label === "yes") return condition ? [condition] : [];
  if (label === "no") return condition ? [`\u00ac(${condition})`] : [];
  if (label.startsWith("case ")) return condition ? [`${condition} === ${label.slice(5)}`] : [label];
  if (label === "default") return ["default"];
  if (label === "catch") return ["catch"];
  return [];
}

function outcome(node) {
  return node.details?.code?.snippet || node.label;
}

function isTerminalNode(node) {
  return node.type === "return" || node.type === "error";
}

function isLoop(node) {
  return ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node);
}

function loopCondition(node, sourceFile) {
  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) return cleanText(node.expression.getText(sourceFile));
  if (ts.isForStatement(node)) return node.condition ? cleanText(node.condition.getText(sourceFile)) : "for";
  if (ts.isForInStatement(node)) return cleanText(`${node.initializer.getText(sourceFile)} in ${node.expression.getText(sourceFile)}`);
  if (ts.isForOfStatement(node)) return cleanText(`${node.initializer.getText(sourceFile)} of ${node.expression.getText(sourceFile)}`);
  return "";
}

function loopLabel(node, sourceFile) {
  if (ts.isWhileStatement(node)) return `while (${node.expression.getText(sourceFile)})`;
  if (ts.isDoStatement(node)) return `do while (${node.expression.getText(sourceFile)})`;
  if (ts.isForStatement(node)) return compact(node.getText(sourceFile).split("{")[0].trim());
  if (ts.isForInStatement(node)) return `for (${node.initializer.getText(sourceFile)} in ${node.expression.getText(sourceFile)})`;
  if (ts.isForOfStatement(node)) return `for (${node.initializer.getText(sourceFile)} of ${node.expression.getText(sourceFile)})`;
  return "loop";
}

function firstCall(node) {
  let found = null;

  function visit(child) {
    if (found) return;
    if (ts.isCallExpression(child)) {
      found = child;
      return;
    }
    ts.forEachChild(child, visit);
  }

  visit(node);
  return found;
}

function caseLabel(clause, sourceFile) {
  return ts.isDefaultClause(clause) ? "default" : `case ${compact(clause.expression.getText(sourceFile))}`;
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function lineNumber(sourceFile, node) {
  const position = node.getStart ? node.getStart(sourceFile) : 0;
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function normalizeDetails(details = {}) {
  return {
    rules: [],
    conditions: [],
    filters: [],
    inputs: [],
    outputs: [],
    ...details,
    rules: asArray(details.rules),
    conditions: asArray(details.conditions),
    filters: asArray(details.filters),
    inputs: asArray(details.inputs),
    outputs: asArray(details.outputs)
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [String(value)];
}

function buildOverlay(entry, file, nodes, language) {
  const nodeOverlays = nodes.map((node) => explainNode(node, language, entry));
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
          risks: ["Cette surcouche explique le graphe deterministe ; faire confiance d'abord aux noeuds, aux liens, aux snippets, aux chemins et aux lignes source."],
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
          risks: ["The overlay explains the deterministic graph; trust the nodes, edges, snippets, paths, and source lines first."],
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
      risks: ["Cette surcouche est explicative ; utiliser les noeuds, liens, snippets, chemins et lignes source deterministes pour corriger la carte."],
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
    risks: ["The overlay is explanatory; use deterministic nodes, edges, snippets, paths, and source lines to correct the map."],
    nodes: nodeOverlays
  };
}

function explainNode(node, language, entry) {
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
  if (node.type === "loop") {
    return language === "fr"
      ? {
          id: node.id,
          plainLanguage: `Repete un bloc tant que cette condition de boucle peut continuer : ${code.condition || node.label}.`,
          effect: "Peut faire passer le processus par les memes etapes plusieurs fois."
        }
      : {
          id: node.id,
          plainLanguage: `Repeat a block while this loop condition can continue: ${code.condition || node.label}.`,
          effect: "Can send the process through the same steps multiple times."
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
    if (entry === "main") {
      return language === "fr"
        ? {
            id: node.id,
            plainLanguage: "La commande choisie est terminee ; Sextant rend la main au terminal.",
            effect: "Fin normale de cette branche de commande."
          }
        : {
            id: node.id,
            plainLanguage: "The selected command is done; Sextant gives control back to the terminal.",
            effect: "Normal end of this command branch."
          };
    }
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
  const clean = cleanText(text);
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function snippet(text) {
  const clean = cleanText(text);
  return clean.length > 240 ? `${clean.slice(0, 237)}...` : clean;
}

function cleanText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "process";
}

function normalizeLanguage(value) {
  return value === "fr" ? "fr" : "en";
}
