const nodeShapes = {
  entry: { open: "((", close: "))" },
  step: { open: "[", close: "]" },
  branch: { open: "{", close: "}" },
  effect: { open: "[/", close: "/]" },
  error: { open: "{{", close: "}}" },
  return: { open: "([", close: "])" },
  loop: { open: "{", close: "}" },
  subflow: { open: "[[", close: "]]" }
};

export function toMermaid(manifest) {
  const lines = [
    "---",
    "config:",
    "  layout: elk",
    "---",
    "flowchart TD"
  ];

  for (const node of manifest.nodes) {
    const shape = nodeShapes[node.type] || nodeShapes.step;
    lines.push(`  ${node.id}${shape.open}"${escapeLabel(node.label)}"${shape.close}`);
  }

  for (const edge of manifest.edges) {
    const label = edge.label ? `|${escapeLabel(edge.label)}|` : "";
    lines.push(`  ${edge.from} -->${label} ${edge.to}`);
  }

  lines.push("");
  lines.push("  classDef entry fill:#fff7df,stroke:#d79b42,color:#25211b,stroke-width:1.5px;");
  lines.push("  classDef step fill:#fffdf7,stroke:#d8d2c4,color:#25211b;");
  lines.push("  classDef branch fill:#f3ead8,stroke:#c9873a,color:#25211b;");
  lines.push("  classDef effect fill:#f7efe2,stroke:#b36b2c,color:#25211b;");
  lines.push("  classDef error fill:#fff0ed,stroke:#c54b3d,color:#25211b;");
  lines.push("  classDef return fill:#f2f1ec,stroke:#8c877d,color:#25211b;");
  lines.push("  classDef loop fill:#f3ead8,stroke:#8b7355,color:#25211b,stroke-dasharray:3 3;");
  lines.push("  classDef subflow fill:#f6f2e8,stroke:#8b7355,color:#25211b,stroke-dasharray:4 3;");

  for (const node of manifest.nodes) {
    lines.push(`  class ${node.id} ${node.type};`);
  }

  lines.push("");

  for (const node of manifest.nodes) {
    lines.push(`  click ${node.id} call sextantShowNode("${node.id}") "Details"`);
  }

  return lines.join("\n");
}

function escapeLabel(label) {
  return String(label).replace(/"/g, "#quot;").replace(/\n/g, "<br/>");
}
