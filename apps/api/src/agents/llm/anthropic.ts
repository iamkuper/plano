import { assertPublicUrl, postJson } from "./http";
import type { ChatMsg, LlmRequest, LlmResponse } from "./types";

function toMessages(messages: ChatMsg[]) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.text };
    if (m.role === "assistant") {
      return {
        role: "assistant",
        content: [
          ...(m.text ? [{ type: "text", text: m.text }] : []),
          ...m.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args })),
        ],
      };
    }
    return { role: "user", content: m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) };
  });
}

export async function anthropic(req: LlmRequest): Promise<LlmResponse> {
  const base = req.baseUrl ? assertPublicUrl(req.baseUrl).toString().replace(/\/$/, "") : "https://api.anthropic.com";
  const data = await postJson(
    `${base}/v1/messages`,
    { "x-api-key": req.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: toMessages(req.messages),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    },
    req.signal,
  );
  const blocks: any[] = data?.content ?? [];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
  };
}
