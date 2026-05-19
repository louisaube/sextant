export function mergeEnrichment(manifest, enrichment, metadata) {
  const enrichmentById = new Map(enrichment.nodes.map((node) => [node.id, node]));

  return {
    ...manifest,
    llm: {
      provider: metadata.provider,
      model: metadata.model,
      cache: metadata.cache,
      promptVersion: metadata.promptVersion,
      enriched: true
    },
    details: {
      ...(manifest.details || {}),
      summary: enrichment.process.summary,
      responsibilities: enrichment.process.responsibilities || [],
      confidence: enrichment.process.confidence,
      suggestedSubflows: enrichment.suggestedSubflows || []
    },
    nodes: manifest.nodes.map((node) => {
      const enriched = enrichmentById.get(node.id);
      if (!enriched) return node;

      return {
        ...node,
        label: enriched.label || node.label,
        type: enriched.type || node.type,
        system: enriched.system || node.system,
        confidence: enriched.confidence ?? node.confidence,
        details: {
          ...(node.details || {}),
          ...(enriched.details || {})
        }
      };
    }),
    edges: manifest.edges
  };
}
