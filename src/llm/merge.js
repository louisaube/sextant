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
      summary: enrichment.process.summary ?? manifest.details?.summary,
      responsibilities: enrichment.process.responsibilities || manifest.details?.responsibilities || [],
      flow: enrichment.process.flow || manifest.details?.flow || [],
      risks: enrichment.process.risks || manifest.details?.risks || [],
      confidence: enrichment.process.confidence ?? manifest.details?.confidence,
      suggestedSubflows: enrichment.suggestedSubflows || manifest.details?.suggestedSubflows || []
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
        details: mergeNodeDetails(node.details, enriched.details)
      };
    }),
    edges: manifest.edges
  };
}

function mergeNodeDetails(current, enriched) {
  const details = {
    ...(current || {}),
    ...(enriched || {})
  };
  const code = {
    ...(current?.code || {}),
    ...(enriched?.code || {})
  };

  if (Object.keys(code).length > 0) {
    details.code = code;
  }

  return details;
}
