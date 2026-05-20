import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const PROMPT_VERSION = "sextant-llm-v5";

export function cacheKey(context, options) {
  return createHash("sha256")
    .update(JSON.stringify({
      promptVersion: PROMPT_VERSION,
      provider: options.provider,
      model: options.model,
      thinking: options.thinking,
      reasoningEffort: options.reasoningEffort,
      context
    }))
    .digest("hex");
}

export async function readCache(key, cacheDir = ".sextant-cache/llm") {
  try {
    const file = path.resolve(cacheDir, `${key}.json`);
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeCache(key, value, cacheDir = ".sextant-cache/llm") {
  const dir = path.resolve(cacheDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify(value, null, 2), "utf8");
}
