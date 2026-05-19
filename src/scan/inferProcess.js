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

const callLabels = {
  printHelp: "Show help to the user",
  initProject: "Create Sextant config",
  parseArgs: "Read command options",
  renderFile: "Render a workflow report",
  watchFile: "Watch and refresh report",
  scanFile: "Scan source file",
  writeReport: "Write HTML, Mermaid, and manifest",
  toHtml: "Build the HTML page",
  toMermaid: "Build the Mermaid diagram",
  inferProcessFromSource: "Infer a process map",
  enrichManifestWithLlm: "Recontextualize with LLM",
  detectDocumentType: "Detect document type",
  createReviewTask: "Create manual review task",
  saveToDrive: "Save file to Drive",
  updatePipedriveDeal: "Update Pipedrive deal",
  sendClassificationEmail: "Email classification result"
};

export function inferProcessFromSource(source, options) {
  const entry = options.entry;
  const file = options.file || "unknown";
  const extracted = extractFunctionBody(source, entry);
  const lines = usefulLines(extracted.body, extracted.startLine);
  const nodes = [
    {
      id: "entry-0",
      type: "entry",
      label: entry,
      details: {
        summary: "Entry point inferred from existing code.",
        plainLanguage: `This is where the ${entry} process starts.`,
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
        plainLanguage: explainNode(inferred),
        effect: explainNodeEffect(inferred),
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
    source: {
      mode: "scan",
      file,
      entry
    },
    details: {
      ...explainProcess(entry, file, nodes),
      flow: nodes.map((node) => node.details?.plainLanguage || node.label),
      risks: ["Retrofit mode is approximate: review snippets and source lines before trusting the graph."]
    },
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
      label: labelDecision(condition, text),
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
      label: labelError(text),
      code: {
        kind: "throw",
        snippet: snippet(text)
      }
    };
  }

  if (/^return\b/.test(text)) {
    return {
      type: "return",
      label: labelReturn(text),
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

function explainProcess(entry, file, nodes) {
  if (entry === "main" && nodes.some((node) => node.details?.code?.condition?.includes("command ==="))) {
    return {
      summary: "Command-line router for Sextant.",
      plainLanguage: "When someone types a Sextant command in a terminal, this process decides which action to run.",
      effect: "It turns one typed command into one visible result: help text, a config file, a rendered report, a watch process, a scanned report, or an error.",
      example: {
        scenario: "A user wants to inspect an existing source file.",
        input: "sextant scan examples/legacy-classify.ts --entry classifyAttachment -o report.html",
        output: "Sextant reads the file, builds a process map, and writes report.html plus the matching Mermaid and manifest files."
      }
    };
  }

  const effectCalls = nodes
    .filter((node) => node.type === "effect" && node.details?.code?.call)
    .map((node) => node.details.code.call);
  const returns = nodes
    .filter((node) => node.type === "return" && node.details?.code?.snippet)
    .map((node) => node.details.code.snippet);

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
    }
  };
}

function explainNode(inferred) {
  if (inferred.type === "branch") {
    return `Decide whether this condition is true: ${inferred.condition}.`;
  }
  if (inferred.type === "effect") {
    return `Run ${inferred.call}; this probably changes something outside the current function.`;
  }
  if (inferred.type === "step") {
    return `Run ${inferred.call}; this delegates part of the work to another function.`;
  }
  if (inferred.type === "return") {
    return "Stop this path and send a result back to the caller.";
  }
  if (inferred.type === "error") {
    return "Stop this path by raising an error.";
  }
  return "Follow this step in the process.";
}

function explainNodeEffect(inferred) {
  if (inferred.type === "branch") {
    return "Chooses which path the process follows next.";
  }
  if (inferred.type === "effect") {
    return `Visible or external effect likely produced by ${inferred.call}.`;
  }
  if (inferred.type === "step") {
    return `Moves work into ${inferred.call}.`;
  }
  if (inferred.type === "return") {
    return "Ends this path.";
  }
  if (inferred.type === "error") {
    return "Rejects this path as invalid or unsupported.";
  }
  return "";
}

function cleanDecision(text) {
  return compact(text.replace(/\s*\{\s*$/, ""));
}

function labelDecision(condition, text) {
  const commandMatch = /command === ["']([^"']+)["']/.exec(condition);
  if (commandMatch) return `If command is ${commandMatch[1]}`;
  if (condition.includes("help") || condition.includes("--help")) return "If user asks for help";
  if (text.startsWith("switch")) return cleanDecision(text);
  return cleanDecision(text);
}

function labelReturn(text) {
  if (text === "return;") return "End this path";
  return compact(text);
}

function labelError(text) {
  if (text.includes("Unknown command")) return "Reject unknown command";
  return compact(text);
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
  if (callLabels[call]) return callLabels[call];

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
