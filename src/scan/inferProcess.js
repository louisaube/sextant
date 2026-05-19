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
        conditions: inferred.type === "branch" ? [line.text.trim()] : [],
        filters: [],
        rules: [],
        inputs: [],
        outputs: inferred.type === "branch" ? ["yes", "no"] : [],
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
    return { type: "branch", label: cleanDecision(text) };
  }

  if (/^throw\b/.test(text)) {
    return { type: "error", label: compact(text) };
  }

  if (/^return\b/.test(text)) {
    return { type: "return", label: compact(text) };
  }

  const call = firstCallName(text);
  if (!call) return null;

  return {
    type: looksLikeEffect(call, text) ? "effect" : "step",
    label: humanizeCall(call)
  };
}

function cleanDecision(text) {
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
