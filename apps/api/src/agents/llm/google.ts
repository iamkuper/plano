import { postJson } from "./http";
import type { ChatMsg, LlmRequest, LlmResponse } from "./types";

function toContents(messages: ChatMsg[]) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.text }] };
    if (m.role === "assistant") {
      return { role: "model", parts: [...(m.text ? [{ text: m.text }] : []), ...m.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } }))] };
    }
    return { role: "user", parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { content: r.content } } })) };
  });
}

export async function google(req: LlmRequest): Promise<LlmResponse> {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
    { "x-goog-api-key": req.apiKey },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toContents(req.messages),
      generationConfig: { maxOutputTokens: req.maxTokens },
      ...(req.tools.length ? { tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] } : {}),
    },
    req.signal,
  );
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  return {
    text: parts.map((p) => p.text).filter(Boolean).join("\n").trim(),
    toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} })),
    inputTokens: data?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
