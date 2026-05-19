const detailArrays = ["rules", "conditions", "filters", "inputs", "outputs", "responsibilities"];

export function validateEnrichment(value, manifest) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LLM enrichment must be a JSON object.");
  }

  const knownNodeIds = new Set(manifest.nodes.map((node) => node.id));
  const nodes = optionalArray(value.nodes, "nodes");
  const suggestedSubflows = optionalArray(value.suggestedSubflows, "suggestedSubflows");

  for (const node of nodes) {
    requireObject(node, "nodes[]");
    requireString(node.id, "nodes[].id");
    if (!knownNodeIds.has(node.id)) {
      throw new Error(`LLM enrichment referenced unknown node id "${node.id}".`);
    }

    if (node.label !== undefined) requireString(node.label, `nodes[${node.id}].label`);
    if (node.type !== undefined) requireString(node.type, `nodes[${node.id}].type`);
    if (node.system !== undefined) requireString(node.system, `nodes[${node.id}].system`);
    if (node.confidence !== undefined) requireNumber(node.confidence, `nodes[${node.id}].confidence`);

    if (node.details !== undefined) {
      requireObject(node.details, `nodes[${node.id}].details`);
      for (const key of detailArrays) {
        optionalStringArray(node.details[key], `nodes[${node.id}].details.${key}`);
      }
      if (node.details.summary !== undefined) {
        requireString(node.details.summary, `nodes[${node.id}].details.summary`);
      }
      if (node.details.system !== undefined) {
        requireString(node.details.system, `nodes[${node.id}].details.system`);
      }
      if (node.details.confidence !== undefined) {
        requireNumber(node.details.confidence, `nodes[${node.id}].details.confidence`);
      }
    }
  }

  for (const subflow of suggestedSubflows) {
    requireObject(subflow, "suggestedSubflows[]");
    requireString(subflow.id, "suggestedSubflows[].id");
    requireString(subflow.label, "suggestedSubflows[].label");
    optionalStringArray(subflow.nodeIds, `suggestedSubflows[${subflow.id}].nodeIds`);
    if (subflow.summary !== undefined) requireString(subflow.summary, `suggestedSubflows[${subflow.id}].summary`);
  }

  if (value.process !== undefined) {
    requireObject(value.process, "process");
    if (value.process.summary !== undefined) requireString(value.process.summary, "process.summary");
    optionalStringArray(value.process.responsibilities, "process.responsibilities");
    if (value.process.confidence !== undefined) requireNumber(value.process.confidence, "process.confidence");
  }

  return {
    version: value.version || 1,
    process: value.process || {},
    nodes,
    suggestedSubflows
  };
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
