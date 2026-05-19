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
Improve business labels and node details.
Allowed shape:
{
  "version": 1,
  "process": {
    "summary": "short process summary",
    "responsibilities": ["short responsibility"],
    "confidence": 0.0
  },
  "nodes": [
    {
      "id": "existing-node-id",
      "label": "business label",
      "type": "entry|step|branch|effect|error|return|subflow",
      "system": "external system name when obvious",
      "confidence": 0.0,
      "details": {
        "summary": "short explanation",
        "rules": ["business rule"],
        "conditions": ["condition/filter"],
        "filters": ["filter"],
        "inputs": ["input data"],
        "outputs": ["output data"],
        "responsibilities": ["responsibility"],
        "system": "external system name when obvious",
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
