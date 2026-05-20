const overlayArrays = ["responsibilities", "flow", "risks", "decisions", "assumptions", "openQuestions"];
const overlayNodeArrays = ["rules", "conditions", "filters", "inputs", "outputs", "responsibilities"];
const allowedTopLevel = new Set(["version", "overlay"]);
const allowedOverlayFields = new Set([
  "summary",
  "plainLanguage",
  "effect",
  "example",
  "responsibilities",
  "flow",
  "risks",
  "decisions",
  "assumptions",
  "openQuestions",
  "confidence",
  "nodes",
  "suggestedSubflows"
]);
const allowedOverlayNodeFields = new Set([
  "id",
  "summary",
  "plainLanguage",
  "effect",
  "rules",
  "conditions",
  "filters",
  "inputs",
  "outputs",
  "responsibilities",
  "system",
  "confidence"
]);
const allowedExampleFields = new Set(["scenario", "input", "output"]);
const allowedSubflowFields = new Set(["id", "label", "nodeIds", "summary"]);

export function validateEnrichment(value, manifest) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LLM enrichment must be a JSON object.");
  }
  rejectUnknownKeys(value, allowedTopLevel, "root");

  const overlay = value.overlay || {};
  requireObject(overlay, "overlay");
  rejectUnknownKeys(overlay, allowedOverlayFields, "overlay");

  const knownNodeIds = new Set(manifest.nodes.map((node) => node.id));
  const nodes = optionalArray(overlay.nodes, "overlay.nodes");
  const suggestedSubflows = optionalArray(overlay.suggestedSubflows, "overlay.suggestedSubflows");

  if (overlay.summary !== undefined) requireString(overlay.summary, "overlay.summary");
  if (overlay.plainLanguage !== undefined) requireString(overlay.plainLanguage, "overlay.plainLanguage");
  if (overlay.effect !== undefined) requireString(overlay.effect, "overlay.effect");
  if (overlay.example !== undefined) validateExample(overlay.example, "overlay.example");
  for (const key of overlayArrays) {
    optionalStringArray(overlay[key], `overlay.${key}`);
  }
  if (overlay.confidence !== undefined) requireNumber(overlay.confidence, "overlay.confidence");

  for (const node of nodes) {
    requireObject(node, "overlay.nodes[]");
    rejectUnknownKeys(node, allowedOverlayNodeFields, "overlay.nodes[]");
    requireString(node.id, "overlay.nodes[].id");
    if (!knownNodeIds.has(node.id)) {
      throw new Error(`LLM overlay referenced unknown node id "${node.id}".`);
    }

    if (node.summary !== undefined) requireString(node.summary, `overlay.nodes[${node.id}].summary`);
    if (node.plainLanguage !== undefined) requireString(node.plainLanguage, `overlay.nodes[${node.id}].plainLanguage`);
    if (node.effect !== undefined) requireString(node.effect, `overlay.nodes[${node.id}].effect`);
    if (node.system !== undefined) requireString(node.system, `overlay.nodes[${node.id}].system`);
    if (node.confidence !== undefined) requireNumber(node.confidence, `overlay.nodes[${node.id}].confidence`);
    for (const key of overlayNodeArrays) {
      optionalStringArray(node[key], `overlay.nodes[${node.id}].${key}`);
    }
  }

  for (const subflow of suggestedSubflows) {
    requireObject(subflow, "overlay.suggestedSubflows[]");
    rejectUnknownKeys(subflow, allowedSubflowFields, "overlay.suggestedSubflows[]");
    requireString(subflow.id, "overlay.suggestedSubflows[].id");
    requireString(subflow.label, "overlay.suggestedSubflows[].label");
    optionalStringArray(subflow.nodeIds, `overlay.suggestedSubflows[${subflow.id}].nodeIds`);
    if (subflow.summary !== undefined) requireString(subflow.summary, `overlay.suggestedSubflows[${subflow.id}].summary`);
  }

  return {
    version: value.version || 1,
    overlay: {
      summary: overlay.summary,
      plainLanguage: overlay.plainLanguage,
      effect: overlay.effect,
      example: overlay.example,
      responsibilities: overlay.responsibilities || [],
      flow: overlay.flow || [],
      risks: overlay.risks || [],
      decisions: overlay.decisions || [],
      assumptions: overlay.assumptions || [],
      openQuestions: overlay.openQuestions || [],
      confidence: overlay.confidence,
      nodes,
      suggestedSubflows
    }
  };
}

function validateExample(value, name) {
  requireObject(value, name);
  rejectUnknownKeys(value, allowedExampleFields, name);
  if (value.scenario !== undefined) requireString(value.scenario, `${name}.scenario`);
  if (value.input !== undefined) requireString(value.input, `${name}.input`);
  if (value.output !== undefined) requireString(value.output, `${name}.output`);
}

function optionalArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`LLM enrichment field "${name}" must be an array.`);
  return value;
}

function optionalStringArray(value, name) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`LLM enrichment field "${name}" must be an array of strings.`);
  }
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`LLM enrichment field "${name}" must be an object.`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string") {
    throw new Error(`LLM enrichment field "${name}" must be a string.`);
  }
}

function requireNumber(value, name) {
  if (typeof value !== "number") {
    throw new Error(`LLM enrichment field "${name}" must be a number.`);
  }
}

function rejectUnknownKeys(value, allowedKeys, name) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`LLM enrichment field "${name}.${key}" is not allowed.`);
    }
  }
}
