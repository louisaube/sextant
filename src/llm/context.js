export function buildLlmContext(source, manifest, options) {
  const entry = options.entry;

  if (manifest.source?.mode === "project") {
    return {
      entry: entry || "project",
      file: options.file || manifest.source.file || "unknown",
      projectSource: source,
      manifest
    };
  }

  return {
    entry,
    file: options.file || "unknown",
    imports: extractImports(source),
    entrySource: extractEntrySource(source, entry),
    calls: extractCalls(extractEntrySource(source, entry)),
    manifest
  };
}

function extractImports(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("import ") || line.startsWith("const ") && line.includes("require("));
}

function extractCalls(source) {
  const calls = new Set();
  const matcher = /(?:await\s+)?([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*\(/g;
  let match;

  while ((match = matcher.exec(source))) {
    const call = match[1];
    if (!["if", "for", "while", "switch", "catch", "function"].includes(call)) {
      calls.add(call);
    }
  }

  return [...calls];
}

function extractEntrySource(source, entry) {
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegExp(entry)}\\s*\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(entry)}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>`),
    new RegExp(`(?:export\\s+)?const\\s+${escapeRegExp(entry)}\\s*=\\s*(?:async\\s*)?[^=]*=>`)
  ];

  const match = patterns.map((pattern) => pattern.exec(source)).find(Boolean);
  if (!match) return "";

  const openIndex = source.indexOf("{", match.index);
  if (openIndex === -1) return "";

  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) {
      return source.slice(match.index, index + 1);
    }
  }

  return "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
