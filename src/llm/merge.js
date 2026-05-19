export function mergeEnrichment(manifest, enrichment, metadata) {
  return {
    ...manifest,
    llm: {
      provider: metadata.provider,
      model: metadata.model,
      cache: metadata.cache,
      promptVersion: metadata.promptVersion,
      enriched: true
    },
    overlay: mergeOverlay(manifest.overlay, enrichment.overlay),
    nodes: manifest.nodes,
    edges: manifest.edges
  };
}

function mergeOverlay(current = {}, enriched = {}) {
  const currentNodes = new Map((current.nodes || []).map((node) => [node.id, node]));
  const enrichedNodes = new Map((enriched.nodes || []).map((node) => [node.id, node]));
  const nodeIds = new Set([...currentNodes.keys(), ...enrichedNodes.keys()]);

  return {
    ...current,
    ...defined({
      summary: enriched.summary,
      plainLanguage: enriched.plainLanguage,
      effect: enriched.effect,
      example: enriched.example,
      responsibilities: enriched.responsibilities?.length ? enriched.responsibilities : undefined,
      flow: enriched.flow?.length ? enriched.flow : undefined,
      risks: enriched.risks?.length ? enriched.risks : undefined,
      confidence: enriched.confidence,
      suggestedSubflows: enriched.suggestedSubflows?.length ? enriched.suggestedSubflows : undefined
    }),
    nodes: [...nodeIds].map((id) => ({
      ...(currentNodes.get(id) || {}),
      ...(enrichedNodes.get(id) || {})
    }))
  };
}

function defined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
