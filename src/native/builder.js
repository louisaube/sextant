let activeBuilder = null;
let currentWorkflow = null;

const defaultNodeDetails = {
  rules: [],
  conditions: [],
  filters: [],
  inputs: [],
  outputs: []
};

class WorkflowBuilder {
  constructor(title, options = {}) {
    this.title = title;
    this.id = options.id || slug(title);
    this.source = options.source || { mode: "native" };
    this.nodes = [];
    this.edges = [];
    this.subflows = [];
    this.index = 0;
    this.cursors = [];
  }

  build(body) {
    const previous = activeBuilder;
    activeBuilder = this;

    const entry = this.addNode("entry", this.title, {
      summary: "Workflow entry point"
    });

    this.cursors = [{ id: entry.id }];
    body();
    activeBuilder = previous;

    return this.toManifest();
  }

  addNode(type, label, details = {}, extra = {}) {
    const id = uniqueId(slug(label || type), this.index++);
    const node = {
      id,
      type,
      label: label || type,
      details: normalizeDetails(details),
      ...extra
    };

    this.nodes.push(node);

    for (const cursor of this.cursors) {
      this.edges.push({
        from: cursor.id,
        to: id,
        ...(cursor.label ? { label: cursor.label } : {})
      });
    }

    this.cursors = [{ id }];
    return node;
  }

  addBranch(label, definition) {
    const { yes, no, rules, conditions, filters, inputs, outputs, summary } = definition;
    const branchNode = this.addNode("branch", label, {
      summary,
      rules,
      conditions,
      filters,
      inputs,
      outputs: outputs || ["yes", "no"]
    });

    const branchEnds = [];

    if (typeof yes === "function") {
      branchEnds.push(...this.runBranchArm(branchNode.id, "yes", yes));
    }

    if (typeof no === "function") {
      branchEnds.push(...this.runBranchArm(branchNode.id, "no", no));
    }

    this.cursors = branchEnds.length > 0 ? branchEnds : [{ id: branchNode.id }];
    return branchNode;
  }

  runBranchArm(fromId, label, body) {
    const before = this.cursors;
    this.cursors = [{ id: fromId, label }];
    body();
    const after = this.cursors;
    this.cursors = before;
    return after;
  }

  addSubflow(label, manifestOrFactory, details = {}) {
    const manifest =
      typeof manifestOrFactory === "function" ? manifestOrFactory() : manifestOrFactory;
    const subflowId = manifest?.id || slug(label);

    if (manifest?.nodes && !this.subflows.some((subflow) => subflow.id === manifest.id)) {
      this.subflows.push(manifest);
    }

    return this.addNode("subflow", label, details, {
      subflow: subflowId
    });
  }

  toManifest() {
    return {
      id: this.id,
      title: this.title,
      source: this.source,
      nodes: this.nodes,
      edges: this.edges,
      subflows: this.subflows
    };
  }
}

export function workflow(title, body, options = {}) {
  if (typeof body !== "function") {
    throw new TypeError("workflow(title, body) expects body to be a function.");
  }

  const builder = new WorkflowBuilder(title, options);
  const manifest = builder.build(body);
  currentWorkflow = manifest;
  return manifest;
}

export function step(label, implementationOrDetails, maybeDetails) {
  return addActionNode("step", label, implementationOrDetails, maybeDetails);
}

export function effect(label, implementationOrDetails, maybeDetails) {
  return addActionNode("effect", label, implementationOrDetails, maybeDetails);
}

export function branch(label, definition) {
  assertBuilder("branch");
  if (!definition || typeof definition !== "object") {
    throw new TypeError("branch(label, definition) expects a definition object.");
  }

  return activeBuilder.addBranch(label, definition);
}

export function subflow(label, manifestOrFactory, details = {}) {
  assertBuilder("subflow");
  return activeBuilder.addSubflow(label, manifestOrFactory, details);
}

export function getCurrentWorkflow() {
  return currentWorkflow;
}

function addActionNode(type, label, implementationOrDetails, maybeDetails) {
  assertBuilder(type);
  const details =
    typeof implementationOrDetails === "function"
      ? maybeDetails || {}
      : implementationOrDetails == null && maybeDetails
        ? maybeDetails
      : implementationOrDetails || {};

  return activeBuilder.addNode(type, label, details);
}

function assertBuilder(name) {
  if (!activeBuilder) {
    throw new Error(`${name}() must be called inside workflow().`);
  }
}

function normalizeDetails(details = {}) {
  return {
    ...defaultNodeDetails,
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

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "node";
}

function uniqueId(base, index) {
  return `${base}-${index}`;
}
