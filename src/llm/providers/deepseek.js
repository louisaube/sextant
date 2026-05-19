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
  return `You enrich Sextant Process Manifests.
Return ONLY valid JSON.
Never invent nodes or edges.
Only reference existing node ids.
Use the code snippets, calls, conditions, and source lines from the manifest.
Make the report concrete and operational, not abstract.
Explain it for a smart non-developer who needs to understand the effect of the process.
Always identify the overall effect: what changes, what is produced, or what becomes possible after this process runs.
Always include a simple input-to-output example.
Avoid generic labels such as "Check Scan Command" or "Process Step".
Prefer labels like "If command is scan, parse args and scan the file".
Keep node labels short enough for a Mermaid graph.
Do not remove deterministic details.code fields.
Allowed shape:
{
  "version": 1,
  "process": {
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
    "confidence": 0.0
  },
  "nodes": [
    {
      "id": "existing-node-id",
      "label": "short operational label",
      "type": "entry|step|branch|effect|error|return|subflow",
      "system": "external system name when obvious",
      "confidence": 0.0,
      "details": {
        "summary": "concrete explanation anchored in the snippet",
        "plainLanguage": "what this node means for a non-developer",
        "effect": "what this node changes, decides, produces, or ends",
        "rules": ["business rule"],
        "conditions": ["condition/filter"],
        "filters": ["filter"],
        "inputs": ["input data"],
        "outputs": ["output data"],
        "responsibilities": ["responsibility"],
        "system": "external system name when obvious",
        "code": {
          "kind": "call|condition|return|throw",
          "call": "real call name when present",
          "condition": "real condition when present",
          "snippet": "short source snippet, max 240 chars"
        },
        "confidence": 0.0
      }
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
}`;
}
