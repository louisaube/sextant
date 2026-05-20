import { buildLlmContext } from "./context.js";
import { cacheKey, PROMPT_VERSION, readCache, writeCache } from "./cache.js";
import { mergeEnrichment } from "./merge.js";
import { validateEnrichment } from "./schema.js";
import { createDeepSeekProvider } from "./providers/deepseek.js";

export async function enrichManifestWithLlm(source, manifest, options = {}) {
  const providerName = options.provider || "deepseek";
  const model = options.model || "deepseek-v4-pro";
  const thinking = options.thinking ?? true;
  const reasoningEffort = options.reasoningEffort || "high";
  const provider = options.providerInstance || createProvider(providerName, options);
  const context = buildLlmContext(source, manifest, {
    entry: manifest.source?.entry || options.entry,
    file: manifest.source?.file || options.file
  });
  const key = cacheKey(context, {
    provider: providerName,
    model,
    thinking,
    reasoningEffort
  });

  let raw = options.cache === false ? null : await readCache(key, options.cacheDir);
  let cacheStatus = raw ? "hit" : "miss";

  if (!raw) {
    raw = await provider.enrichProcess(context, {
      model,
      thinking,
      reasoningEffort,
      timeoutMs: options.timeoutMs
    });
  }

  const enrichment = validateEnrichment(raw, manifest);

  if (cacheStatus === "miss" && options.cache !== false) {
    await writeCache(key, raw, options.cacheDir);
  }

  return mergeEnrichment(manifest, enrichment, {
    provider: providerName,
    model,
    thinking,
    reasoningEffort,
    cache: cacheStatus,
    promptVersion: PROMPT_VERSION
  });
}

export function createProvider(name, options = {}) {
  if (name === "deepseek") return createDeepSeekProvider(options);
  throw new Error(`Unsupported LLM provider "${name}".`);
}

export { buildLlmContext } from "./context.js";
export { createMockProvider } from "./providers/mock.js";
