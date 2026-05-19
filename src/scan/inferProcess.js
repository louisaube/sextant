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
  let previous = nodes[0].id;
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
    if (previous) {
      edges.push({ from: previous, to: node.id });
    }
    previous = isTerminal(inferred.type) ? null : node.id;
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
  return body
    .split(/\r?\n/)
    .map((text, offset) => ({
      number: startLine + offset,
      text: text.replace(/\/\/.*$/, "").trim()
    }))
    .filter((line) => line.text && line.text !== "{" && line.text !== "}");
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
