import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let ts;

const effectWords = [
  "send", "email", "mail", "notify", "create", "update", "delete", "save", "write", "persist",
  "post", "put", "patch", "fetch", "axios", "drive", "pipedrive", "db", "prisma", "sql", "query"
];

const defaultMaxPaths = 64;
const defaultDepth = 2;
const defaultMaxFrames = 32;

export function inferProcessFromSource(source, options = {}) {
  ensureTypeScript();
  const entry = options.entry;
  if (!entry) throw new Error("inferProcessFromSource expects options.entry.");

  const file = options.file || "unknown";
  const language = normalizeLanguage(options.language || options.lang);
  const context = options.context || createScanContext(file, options);
  const depth = normalizeNumber(options.depth, defaultDepth);
  if (file && file !== "unknown") context.sources.set(path.resolve(file), source);
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const fileIndex = buildFileIndex(sourceFile);
  const entryNode = findEntry(sourceFile, entry, fileIndex);
  const key = scanKey(file, entry);
  const builder = new AstProcessBuilder(sourceFile, file, entry, language, {
    context,
    depth,
    fileIndex,
    currentClass: classNameForEntry(fileIndex, entry)
  });
  const body = entryNode.body;

  if (!body || !ts.isBlock(body)) throw new Error(`Entry "${entry}" does not look like a block function.`);

  context.stack.add(key);
  try {
    builder.emitStatements(body.statements, [builder.entryCursor]);
  } finally {
    context.stack.delete(key);
  }

  const nodes = builder.nodes;
  const edges = builder.edges;
  const manifestId = options.id || (options.qualifyId ? qualifiedScanId(file, entry, context) : slug(entry));

  return {
    id: manifestId,
    title: entry,
    language,
    source: { mode: "scan", file, entry },
    details: {
      summary: language === "fr" ? `Scan retrofit de ${entry}.` : `Retrofit scan of ${entry}.`,
      risks: [language === "fr"
        ? "Le mode retrofit est approximatif : verifier les snippets, les chemins et les lignes source avant de faire confiance au graphe."
        : "Retrofit mode is approximate: review snippets, paths, and source lines before trusting the graph."]
    },
    overlay: buildOverlay(entry, file, nodes, language),
    analysis: buildAnalysis(nodes, edges, { maxPaths: defaultMaxPaths }),
    nodes,
    edges,
    subflows: builder.subflows
  };
}

class AstProcessBuilder {
  constructor(sourceFile, file, entry, language, options = {}) {
    this.sourceFile = sourceFile;
    this.file = file;
    this.entry = entry;
    this.language = language;
    this.context = options.context;
    this.depth = options.depth;
    this.fileIndex = options.fileIndex || buildFileIndex(sourceFile);
    this.currentClass = options.currentClass || classNameForEntry(this.fileIndex, entry);
    this.instances = new Map();
    this.subflows = [];
    this.nodes = [];
    this.edges = [];
    this.index = 0;
    this.entryNode = this.createNode("entry", entry, sourceFile, { summary: "Entry point inferred from existing code." });
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
    if (ts.isBlock(statement)) return this.emitStatements(statement.statements, cursors);
    if (ts.isIfStatement(statement)) return this.emitIf(statement, cursors);
    if (ts.isSwitchStatement(statement)) return this.emitSwitch(statement, cursors);
    if (ts.isTryStatement(statement)) return this.emitTry(statement, cursors);
    if (isLoop(statement)) return this.emitLoop(statement, cursors);
    if (ts.isReturnStatement(statement)) return this.emitReturn(statement, cursors);
    if (ts.isThrowStatement(statement)) return this.emitThrow(statement, cursors);
    if (ts.isVariableStatement(statement)) this.recordLocalInstances(statement);
    if (!ts.isExpressionStatement(statement) && !ts.isVariableStatement(statement)) return cursors;
    const call = firstCall(statement);
    return call ? this.emitCall(call, statement, cursors) : cursors;
  }

  emitCall(call, astNode, cursors, override = {}) {
    const callee = override.callee || call.expression.getText(this.sourceFile);
    const text = override.text || astNode.getText(this.sourceFile);
    const resolved = this.resolveCallTarget(call, callee, text);
    const node = this.createNode(callNodeType(callee, text, resolved.callTarget), humanizeCall(callee), astNode, {
      summary: "Inferred from AST statement. Retrofit mode is approximate.",
      code: { kind: "call", call: callee, snippet: snippet(text) },
      callTarget: resolved.callTarget
    }, resolved.subflowId ? { subflow: resolved.subflowId } : {});
    this.connect(cursors, node.id);
    return [{ nodeId: node.id }];
  }

  emitIf(statement, cursors) {
    const condition = cleanText(statement.expression.getText(this.sourceFile));
    const branch = this.createNode("branch", compact(`if (${condition})`), statement.expression, {
      summary: "Inferred from AST if statement. Retrofit mode is approximate.",
      conditions: [condition],
      outputs: ["yes", "no"],
      code: { kind: "condition", condition, snippet: snippet(statement.expression.getText(this.sourceFile)) }
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
      code: { kind: "condition", condition: expression, snippet: snippet(statement.expression.getText(this.sourceFile)) }
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
      code: { kind: "condition", condition: "try", snippet: snippet("try") }
    });
    this.connect(cursors, branch.id);
    const tryOut = this.emitStatements(statement.tryBlock.statements, [{ nodeId: branch.id, label: "try" }]);
    const catchOut = statement.catchClause ? this.emitStatement(statement.catchClause.block, [{ nodeId: branch.id, label: "catch" }]) : [];
    const combined = [...tryOut, ...catchOut];
    return statement.finallyBlock ? this.emitStatements(statement.finallyBlock.statements, combined) : combined;
  }

  emitLoop(statement, cursors) {
    const condition = loopCondition(statement, this.sourceFile);
    const loop = this.createNode("loop", compact(loopLabel(statement, this.sourceFile)), statement, {
      summary: "Inferred from AST loop statement. Paths traverse the loop body at most once.",
      conditions: condition ? [condition] : [],
      outputs: ["body", "exit"],
      code: { kind: "condition", condition, snippet: snippet(statement.getText(this.sourceFile)) }
    });
    this.connect(cursors, loop.id);
    const bodyOut = this.emitStatement(statement.statement, [{ nodeId: loop.id, label: "body" }]);
    for (const cursor of bodyOut) this.addEdge(cursor.nodeId, loop.id, "repeat");
    return [{ nodeId: loop.id, label: "exit" }, ...bodyOut.map((cursor) => ({ nodeId: cursor.nodeId, label: "exit" }))];
  }

  emitReturn(statement, cursors) {
    let current = cursors;
    const handlers = jsxHandlerCalls(statement.expression, this.sourceFile);
    for (const handler of handlers) {
      current = this.emitCall(handler.call, handler.node, current, { callee: handler.callee, text: handler.node.getText(this.sourceFile) });
    }
    const returnCall = handlers.length === 0 && statement.expression ? firstCall(statement.expression) : null;
    if (returnCall) current = this.emitCall(returnCall, statement, current);
    const text = statement.getText(this.sourceFile);
    const node = this.createNode("return", compact(text), statement, {
      summary: "Inferred from AST return statement. Retrofit mode is approximate.",
      code: { kind: "return", snippet: snippet(text) }
    });
    this.connect(current, node.id);
    return [];
  }

  emitThrow(statement, cursors) {
    const text = statement.getText(this.sourceFile);
    const node = this.createNode("error", compact(text), statement, {
      summary: "Inferred from AST throw statement. Retrofit mode is approximate.",
      code: { kind: "throw", snippet: snippet(text) }
    });
    this.connect(cursors, node.id);
    return [];
  }

  resolveCallTarget(call, callee, text) {
    const target = inferCallTarget(call, callee, text, {
      file: this.file,
      sourceFile: this.sourceFile,
      fileIndex: this.fileIndex,
      currentClass: this.currentClass,
      instances: this.instances,
      context: this.context
    });
    if (!isScannableTarget(target)) return { callTarget: target };
    const targetKey = scanKey(target.file, target.entry);
    if (this.context.stack.has(targetKey)) return { callTarget: { ...target, reason: "cycle" } };
    if (this.depth <= 0) return { callTarget: { ...target, reason: "depth-limit" } };
    if (this.context.frameCount >= this.context.maxFrames) return { callTarget: { ...target, reason: "frame-cap" } };
    const source = readSource(target.file, this.context);
    if (!source) return { callTarget: { ...target, reason: "opaque" } };
    this.context.frameCount += 1;
    try {
      const subflow = inferProcessFromSource(source, {
        entry: target.entry,
        file: target.file,
        language: this.language,
        depth: this.depth - 1,
        maxFrames: this.context.maxFrames,
        qualifyId: true,
        context: this.context
      });
      this.subflows.push(subflow);
      return { callTarget: { ...target, reason: "expanded" }, subflowId: subflow.id };
    } catch (error) {
      return { callTarget: { ...target, reason: `unresolved: ${error.message}` } };
    }
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
        source: { file: this.file, line: lineNumber(this.sourceFile, astNode) }
      }),
      ...extra
    };
    this.nodes.push(node);
    return node;
  }

  connect(cursors, to) {
    for (const cursor of cursors) this.addEdge(cursor.nodeId, to, cursor.label);
  }

  addEdge(from, to, label) {
    if (!from || !to) return;
    if (this.edges.some((edge) => edge.from === from && edge.to === to && edge.label === label)) return;
    this.edges.push({ from, to, ...(label ? { label } : {}) });
  }

  recordLocalInstances(statement) {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const className = newExpressionClassName(declaration.initializer);
      if (className && this.fileIndex.classes.has(className)) this.instances.set(declaration.name.text, className);
    }
  }
}

function buildFileIndex(sourceFile) {
  const locals = new Map();
  const imports = new Map();
  const classes = new Map();
  const methods = new Map();
  let defaultExport = null;

  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name?.text) {
      indexClass(statement.name.text, statement, classes, methods);
      continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name?.text) {
      locals.set(statement.name.text, statement);
      if (hasDefaultModifier(statement)) defaultExport = statement;
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (ts.isClassExpression(declaration.initializer)) {
          indexClass(declaration.name.text, declaration.initializer, classes, methods);
          continue;
        }
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          locals.set(declaration.name.text, declaration.initializer);
          if (hasDefaultModifier(statement)) defaultExport = declaration.initializer;
        }
      }
      continue;
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) imports.set(clause.name.text, { specifier, imported: "default" });
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, { specifier, imported: element.propertyName?.text || element.name.text });
        }
      }
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      defaultExport = locals.get(statement.expression.text) || defaultExport;
    }
  }

  return { locals, imports, classes, methods, defaultExport };
}

function findEntry(sourceFile, entry, fileIndex = buildFileIndex(sourceFile)) {
  const method = fileIndex.methods.get(entry);
  const found = fileIndex.locals.get(entry) || method?.node || (entry === "default" ? fileIndex.defaultExport : null);
  if (found) return found;
  throw new Error(`Could not find entry "${entry}".`);
}

function indexClass(className, classNode, classes, methods) {
  classes.set(className, classNode);
  for (const member of classNode.members || []) {
    if (!ts.isMethodDeclaration(member) || !member.body) continue;
    const name = memberName(member.name);
    if (!name || name === "constructor") continue;
    const entry = `${className}.${name}`;
    methods.set(entry, {
      node: member,
      className,
      methodName: name,
      static: hasStaticModifier(member)
    });
  }
}

function inferPropertyCallTarget(expression, options) {
  if (!ts.isPropertyAccessExpression(expression)) return null;
  const methodName = expression.name.text;
  const receiver = expression.expression;

  if (isThisExpression(receiver) && options.currentClass) {
    return methodTarget(options.currentClass, methodName, options);
  }

  if (ts.isIdentifier(receiver)) {
    const className = receiver.text;
    if (options.fileIndex.classes.has(className)) return methodTarget(className, methodName, options, { staticOnly: true });
    const instanceClass = options.instances?.get(className);
    if (instanceClass) return methodTarget(instanceClass, methodName, options);
  }

  const newClassName = newExpressionClassName(receiver);
  if (newClassName) return methodTarget(newClassName, methodName, options);

  return null;
}

function methodTarget(className, methodName, options, constraints = {}) {
  const entry = `${className}.${methodName}`;
  const method = options.fileIndex.methods.get(entry);
  if (!method) return null;
  if (constraints.staticOnly && !method.static) return null;
  return { kind: localKind(entry, options.file), file: options.file, entry };
}

function classNameForEntry(fileIndex, entry) {
  return fileIndex.methods.get(entry)?.className || "";
}

function newExpressionClassName(expression) {
  if (!expression || !ts.isNewExpression(expression)) return "";
  const target = expression.expression;
  return ts.isIdentifier(target) ? target.text : "";
}

function isThisExpression(node) {
  return node?.kind === ts.SyntaxKind.ThisKeyword;
}

function memberName(name) {
  if (!name) return "";
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return "";
}

function inferCallTarget(call, callee, text, options) {
  const localName = localCallableName(call.expression);
  const propertyTarget = inferPropertyCallTarget(call.expression, options);
  if (propertyTarget) return propertyTarget;

  const callText = callee.toLowerCase();
  const local = localName ? options.fileIndex.locals.get(localName) : null;

  if (local) return { kind: localKind(localName, options.file), file: options.file, entry: localName };

  if (localName && options.fileIndex.imports.has(localName)) {
    const imported = options.fileIndex.imports.get(localName);
    const importedFile = resolveRelativeModule(options.file, imported.specifier);
    if (!importedFile) return { kind: classifyResourceKind(callee, text, options.file), entry: imported.imported, reason: "unresolved" };

    const importedSource = readSource(importedFile, options.context);
    const importedEntry = imported.imported;
    if (importedSource) {
      const importedSourceFile = ts.createSourceFile(importedFile, importedSource, ts.ScriptTarget.Latest, true, scriptKind(importedFile));
      const importedIndex = buildFileIndex(importedSourceFile);
      const resolvedEntry = importedEntry === "default" ? defaultExportName(importedIndex) || "default" : importedEntry;
      const canOpen = Boolean(importedIndex.locals.get(resolvedEntry) || (resolvedEntry === "default" && importedIndex.defaultExport));
      if (canOpen) return { kind: localKind(resolvedEntry, importedFile), file: importedFile, entry: resolvedEntry };
    }

    return { kind: classifyResourceKind(callee, text, importedFile), file: importedFile, entry: importedEntry, reason: "opaque" };
  }

  const routeTarget = resolveFetchRoute(call, callee, options);
  if (routeTarget) return routeTarget;

  if (isDataCall(callText)) return { kind: "data", system: detectSystem(callText) || "data", operation: callee, reason: "opaque" };
  if (isStorageCall(callText)) return { kind: "storage", system: detectSystem(callText) || "storage", operation: callee, reason: "opaque" };
  if (isIntegrationCall(callText)) return { kind: "integration", system: detectSystem(callText) || "external", operation: callee, reason: "opaque" };
  if (localName && looksLikeFrontHandler(localName, options.file)) return { kind: "front", entry: localName, reason: "unresolved" };

  return { kind: "unresolved", entry: localName || callee, reason: "unresolved" };
}

function resolveFetchRoute(call, callee, options) {
  const callName = callee.toLowerCase();
  if (!callName.includes("fetch") && !callName.includes("axios")) return null;
  const url = firstStringArgument(call, options.sourceFile);
  if (!url) return { kind: "integration", system: "http", operation: callee, reason: "opaque" };
  const route = url.startsWith("/api/") ? findLocalRoute(options.context.rootDir, url, options.context) : null;
  if (route) return { kind: "route", file: route.file, entry: route.entry, system: "http", operation: url };
  return { kind: url.startsWith("/api/") ? "route" : "integration", system: "http", operation: url, reason: "opaque" };
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
  return { paths, pathCount: paths.length, truncated, maxPaths };

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
      paths.push({ id: `path-${paths.length + 1}`, nodeIds: nextPath, condition: conditions, terminal: nodeId, outcome: outcome(node) });
      return;
    }
    for (const edge of nextEdges) dfs(edge.to, nextPath, [...conditions, ...conditionsForEdge(edge, node)]);
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
  return ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);
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

function jsxHandlerCalls(expression, sourceFile) {
  if (!expression) return [];
  const handlers = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(sourceFile))) {
      const initializer = node.initializer;
      const jsxExpression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : null;
      const callee = jsxExpression ? localCallableName(jsxExpression) : null;
      const nestedCall = jsxExpression ? firstCall(jsxExpression) : null;
      if (nestedCall) handlers.push({ call: nestedCall, callee: nestedCall.expression.getText(sourceFile), node });
      else if (callee) handlers.push({ call: fakeCallExpression(callee), callee, node });
    }
    ts.forEachChild(node, visit);
  }
  visit(expression);
  return handlers;
}

function fakeCallExpression(name) {
  return { expression: { getText: () => name, kind: ts.SyntaxKind.Identifier, escapedText: name, text: name }, arguments: [] };
}

function callNodeType(callee, text, target) {
  if (target?.kind && ["data", "storage", "integration", "route"].includes(target.kind)) return "effect";
  return looksLikeEffect(callee, text) ? "effect" : "step";
}

function isScannableTarget(target) {
  return Boolean(target && target.file && target.entry && ["code", "front", "route", "data"].includes(target.kind));
}

function localCallableName(expression) {
  if (!expression) return null;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return null;
  if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) return localCallableName(expression.expression);
  return null;
}

function localKind(name, file) {
  if (looksLikeFrontHandler(name, file)) return "front";
  if (looksLikeRouteFile(file)) return "route";
  if (looksLikeDataFile(file)) return "data";
  return "code";
}

function classifyResourceKind(callee, text, file) {
  const value = `${callee} ${text} ${file || ""}`.toLowerCase();
  if (isDataCall(value) || looksLikeDataFile(file)) return "data";
  if (isStorageCall(value)) return "storage";
  if (looksLikeRouteFile(file)) return "route";
  if (looksLikeFrontFile(file)) return "front";
  if (isIntegrationCall(value)) return "integration";
  return "unresolved";
}

function isDataCall(value) {
  return /\b(prisma|db|sql|query|knex|sequelize|repository)\b/.test(value);
}

function isStorageCall(value) {
  return /\b(drive|storage|bucket|upload|download|file)\b/.test(value);
}

function isIntegrationCall(value) {
  return /\b(fetch|axios|pipedrive|email|mail|sendgrid|slack|webhook|http)\b/.test(value);
}

function detectSystem(value) {
  if (value.includes("pipedrive")) return "Pipedrive";
  if (value.includes("drive")) return "Drive";
  if (value.includes("prisma")) return "Prisma";
  if (value.includes("sql")) return "SQL";
  if (value.includes("email") || value.includes("mail") || value.includes("sendgrid")) return "email";
  if (value.includes("fetch") || value.includes("axios") || value.includes("http")) return "HTTP";
  return "";
}

function looksLikeFrontHandler(name, file) {
  return /^handle[A-Z]/.test(name || "") || looksLikeFrontFile(file);
}

function looksLikeFrontFile(file) {
  return /\.(tsx|jsx)$/.test(file || "") || /(^|[\\/])(components|pages|app|ui)([\\/]|$)/i.test(file || "");
}

function looksLikeRouteFile(file) {
  return /(^|[\\/])(api|routes)([\\/]|$)/i.test(file || "") || /route\.(ts|tsx|js|jsx)$/i.test(file || "");
}

function looksLikeDataFile(file) {
  return /schema\.prisma$|migrations?[\\/]|\.sql$|(^|[\\/])(db|database|repositories)([\\/]|$)/i.test(file || "");
}

function firstStringArgument(call, sourceFile) {
  const first = call.arguments?.[0];
  if (!first) return "";
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) return first.text;
  return cleanText(first.getText(sourceFile));
}

function findLocalRoute(rootDir, url, context) {
  const routePath = url.replace(/^\/api\/?/, "").replace(/[?#].*$/, "");
  const parts = routePath.split("/").filter(Boolean);
  const candidates = [
    path.join(rootDir, "src", "app", "api", ...parts, "route.ts"),
    path.join(rootDir, "src", "app", "api", ...parts, "route.tsx"),
    path.join(rootDir, "app", "api", ...parts, "route.ts"),
    path.join(rootDir, "app", "api", ...parts, "route.tsx"),
    path.join(rootDir, "src", "pages", "api", ...parts) + ".ts",
    path.join(rootDir, "src", "pages", "api", ...parts) + ".js",
    path.join(rootDir, "pages", "api", ...parts) + ".ts",
    path.join(rootDir, "pages", "api", ...parts) + ".js"
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const source = readSource(candidate, context);
    if (!source) return { file: candidate, entry: "default" };
    const sourceFile = ts.createSourceFile(candidate, source, ts.ScriptTarget.Latest, true, scriptKind(candidate));
    const index = buildFileIndex(sourceFile);
    const entry = ["GET", "POST", "handler", "default"].find((name) => index.locals.has(name) || (name === "default" && index.defaultExport));
    return { file: candidate, entry: entry || "default" };
  }
  return null;
}

function resolveRelativeModule(fromFile, specifier) {
  if (!specifier || !specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(path.resolve(fromFile)), specifier);
  const candidates = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
    path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js"), path.join(base, "index.jsx")
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function readSource(file, context) {
  const absolute = path.resolve(file);
  if (context.sources.has(absolute)) return context.sources.get(absolute);
  try {
    const source = readFileSync(absolute, "utf8");
    context.sources.set(absolute, source);
    return source;
  } catch {
    return "";
  }
}

function createScanContext(file, options = {}) {
  const rootDir = path.resolve(options.rootDir || (file && file !== "unknown" ? path.dirname(path.resolve(file)) : process.cwd()));
  return { rootDir, stack: new Set(), sources: new Map(), maxFrames: normalizeNumber(options.maxFrames, defaultMaxFrames), frameCount: 0 };
}

function scanKey(file, entry) {
  return `${path.resolve(file || "unknown")}::${entry}`;
}

function qualifiedScanId(file, entry, context) {
  if (!file || file === "unknown") return slug(entry);
  const root = context?.rootDir || process.cwd();
  const relative = path.relative(root, path.resolve(file));
  return slug(`${relative || path.basename(file)}-${entry}`);
}

function defaultExportName(index) {
  for (const [name, node] of index.locals.entries()) {
    if (node === index.defaultExport) return name;
  }
  return index.defaultExport ? "default" : "";
}

function hasDefaultModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
}

function hasStaticModifier(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword));
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
    return language === "fr" ? {
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
    } : {
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
  const effectCalls = nodes.filter((node) => node.type === "effect" && node.details?.code?.call).map((node) => node.details.code.call);
  const returns = nodes.filter((node) => node.type === "return" && node.details?.code?.snippet).map((node) => node.details.code.snippet);
  if (language === "fr") {
    return {
      summary: `Scan retrofit de ${entry}.`,
      plainLanguage: `Cette carte suit ce qui se passe apres l'appel a ${entry}.`,
      effect: effectCalls.length > 0 ? `Ce processus peut modifier des sorties ou des systemes externes via : ${effectCalls.join(", ")}.` : "Ce processus organise surtout des decisions et des appels internes.",
      example: { scenario: `Quelqu'un appelle ${entry} depuis ${file}.`, input: `${entry}(...)`, output: returns.length > 0 ? returns.join(" ou ") : "Le processus atteint la derniere action visible dans le graphe." },
      flow,
      risks: ["Cette surcouche est explicative ; utiliser les noeuds, liens, snippets, chemins et lignes source deterministes pour corriger la carte."],
      nodes: nodeOverlays
    };
  }
  return {
    summary: `Retrofit scan of ${entry}.`,
    plainLanguage: `This map follows what happens after ${entry} is called.`,
    effect: effectCalls.length > 0 ? `It can change external systems or outputs through: ${effectCalls.join(", ")}.` : "It mainly organizes decisions and internal function calls.",
    example: { scenario: `Someone calls ${entry} from ${file}.`, input: `${entry}(...)`, output: returns.length > 0 ? returns.join(" or ") : "The process reaches the final action shown in the graph." },
    flow,
    risks: ["The overlay is explanatory; use deterministic nodes, edges, snippets, paths, and source lines to correct the map."],
    nodes: nodeOverlays
  };
}

function explainNode(node, language, entry) {
  const code = node.details?.code || {};
  const target = node.details?.callTarget;
  if (node.type === "entry") return language === "fr"
    ? { id: node.id, plainLanguage: `C'est ici que le processus ${node.label} commence.`, effect: "Demarre le processus montre dans le graphe." }
    : { id: node.id, plainLanguage: `This is where the ${node.label} process starts.`, effect: "Starts the process shown in the graph." };
  if (node.type === "branch") return language === "fr"
    ? { id: node.id, plainLanguage: `Decide si cette condition est vraie : ${code.condition || node.label}.`, effect: "Choisit le prochain chemin du processus." }
    : { id: node.id, plainLanguage: `Decide whether this condition is true: ${code.condition || node.label}.`, effect: "Chooses which path the process follows next." };
  if (node.type === "loop") return language === "fr"
    ? { id: node.id, plainLanguage: `Repete un bloc tant que cette condition de boucle peut continuer : ${code.condition || node.label}.`, effect: "Peut faire passer le processus par les memes etapes plusieurs fois." }
    : { id: node.id, plainLanguage: `Repeat a block while this loop condition can continue: ${code.condition || node.label}.`, effect: "Can send the process through the same steps multiple times." };
  if (node.type === "effect") return language === "fr"
    ? { id: node.id, plainLanguage: effectPlainLanguage(code.call || node.label, target, language), effect: target?.kind === "data" ? "Touche probablement une ressource de donnees." : `Effet visible ou externe probablement produit par ${code.call || node.label}.` }
    : { id: node.id, plainLanguage: effectPlainLanguage(code.call || node.label, target, language), effect: target?.kind === "data" ? "Likely touches a data resource." : `Visible or external effect likely produced by ${code.call || node.label}.` };
  if (node.type === "step") return language === "fr"
    ? {
        id: node.id,
        plainLanguage: target?.reason === "expanded" ? `Lance ${code.call || node.label} ; une frame detaillee est disponible.` : `Lance ${code.call || node.label} ; une partie du travail est deleguee a une autre fonction.`,
        effect: target?.reason === "expanded" ? `Ouvre le detail du travail realise par ${code.call || node.label}.` : `Deplace le travail vers ${code.call || node.label}.`
      }
    : {
        id: node.id,
        plainLanguage: target?.reason === "expanded" ? `Run ${code.call || node.label}; a detailed frame is available.` : `Run ${code.call || node.label}; this delegates part of the work to another function.`,
        effect: target?.reason === "expanded" ? `Opens the work done by ${code.call || node.label}.` : `Moves work into ${code.call || node.label}.`
      };
  if (node.type === "return") {
    if (entry === "main") return language === "fr"
      ? { id: node.id, plainLanguage: "La commande choisie est terminee ; Sextant rend la main au terminal.", effect: "Fin normale de cette branche de commande." }
      : { id: node.id, plainLanguage: "The selected command is done; Sextant gives control back to the terminal.", effect: "Normal end of this command branch." };
    return language === "fr"
      ? { id: node.id, plainLanguage: "Arrete ce chemin et renvoie un resultat a l'appelant.", effect: "Termine ce chemin." }
      : { id: node.id, plainLanguage: "Stop this path and send a result back to the caller.", effect: "Ends this path." };
  }
  if (node.type === "error") return language === "fr"
    ? { id: node.id, plainLanguage: "Arrete ce chemin en levant une erreur.", effect: "Rejette ce chemin comme invalide ou non supporte." }
    : { id: node.id, plainLanguage: "Stop this path by raising an error.", effect: "Rejects this path as invalid or unsupported." };
  return language === "fr" ? { id: node.id, plainLanguage: "Suit cette etape du processus.", effect: "" } : { id: node.id, plainLanguage: "Follow this step in the process.", effect: "" };
}

function effectPlainLanguage(call, target, language) {
  if (language === "fr") {
    if (target?.kind === "route") return `Appelle une route ou une API : ${target.operation || call}.`;
    if (target?.kind === "data") return `Interagit avec une couche de donnees : ${target.operation || call}.`;
    if (target?.kind === "storage") return `Interagit avec un stockage ou fichier : ${target.operation || call}.`;
    if (target?.kind === "integration") return `Appelle un systeme externe : ${target.system || target.operation || call}.`;
    return `Lance ${call} ; cela modifie probablement quelque chose hors de la fonction courante.`;
  }
  if (target?.kind === "route") return `Calls a route or API: ${target.operation || call}.`;
  if (target?.kind === "data") return `Interacts with a data layer: ${target.operation || call}.`;
  if (target?.kind === "storage") return `Interacts with storage or files: ${target.operation || call}.`;
  if (target?.kind === "integration") return `Calls an external system: ${target.system || target.operation || call}.`;
  return `Run ${call}; this probably changes something outside the current function.`;
}

function looksLikeEffect(call, text) {
  const value = `${call} ${text}`.toLowerCase();
  return effectWords.some((word) => value.includes(word));
}

function humanizeCall(call) {
  return String(call).split(".").pop().replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
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
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "process";
}

function normalizeLanguage(value) {
  return value === "fr" ? "fr" : "en";
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function ensureTypeScript() {
  if (!ts) ts = require("typescript");
  return ts;
}
