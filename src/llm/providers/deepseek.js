export function createDeepSeekProvider(options = {}) {
  return {
    name: "deepseek",
    async enrichProcess(context, requestOptions = {}) {
      const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error("scan --llm requires DEEPSEEK_API_KEY.");
      }

      const model = requestOptions.model || "deepseek-chat";
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt()
            },
            {
              role: "user",
              content: JSON.stringify(context, null, 2)
            }
          ],
          response_format: {
            type: "json_object"
          },
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`DeepSeek API failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("DeepSeek API returned no message content.");
      }

      try {
        return JSON.parse(content);
      } catch {
        throw new Error("DeepSeek API returned invalid JSON content.");
      }
    }
  };
}

function systemPrompt() {
  return `You write an explanatory overlay for Sextant Process Manifests.
Return ONLY valid JSON.
Never invent, rename, reorder, or delete graph nodes or edges.
Never output node labels, node types, edge definitions, source snippets, or code fields.
Only reference existing node ids inside overlay.nodes.
The deterministic manifest is the source of truth. Your job is an interpretive overlay only.
Use the language requested by manifest.language. If manifest.language is "fr", write the overlay in French.
Explain the overall effect for a smart non-developer: what changes, what is produced, or what becomes possible after the process runs.
Always include a simple input-to-output example.
Allowed shape:
{
  "version": 1,
  "overlay": {
    "summary": "concrete summary of what the entry point does",
    "plainLanguage": "explain this process for a non-developer",
    "effect": "the overall visible or operational effect",
    "example": {
      "scenario": "short concrete scenario",
      "input": "what a user/system gives this process",
      "output": "what the process produces or changes"
    },
    "responsibilities": ["concrete responsibility"],
    "flow": ["main execution step in plain language"],
    "risks": ["concrete ambiguity, failure mode, or code-reading warning"],
    "confidence": 0.0,
    "nodes": [
      {
        "id": "existing-node-id",
        "summary": "explanation anchored in the deterministic snippet/source",
        "plainLanguage": "what this node means for a non-developer",
        "effect": "what this node changes, decides, produces, or ends",
        "rules": ["business rule"],
        "conditions": ["condition/filter explanation"],
        "filters": ["filter explanation"],
        "inputs": ["input data explanation"],
        "outputs": ["output data explanation"],
        "responsibilities": ["responsibility"],
        "system": "external system name when obvious",
        "confidence": 0.0
      }
    ],
    "suggestedSubflows": [
      {
        "id": "stable-slug",
        "label": "Subflow label",
        "nodeIds": ["existing-node-id"],
        "summary": "why these nodes belong together"
      }
    ]
  }
}`;
}
