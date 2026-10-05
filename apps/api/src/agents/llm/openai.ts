import { assertPublicUrl, postJson } from "./http";
import { LlmError, type ChatMsg, type LlmRequest, type LlmResponse } from "./types";

function toMessages(system: string, messages: ChatMsg[]) {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.text });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
      });
    } else for (const r of m.results) out.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
  return out;
}

// OpenAI and everything that speaks its chat-completions protocol
// (OpenRouter, DeepSeek, Mistral, Groq, a local server...).
export async function openai(req: LlmRequest): Promise<LlmResponse> {
  const compatible = req.provider === "OPENAI_COMPATIBLE";
  if (compatible && !req.baseUrl) throw new LlmError("base URL is required");
  const base = (req.baseUrl ? assertPublicUrl(req.baseUrl).toString() : "https://api.openai.com/v1").replace(/\/$/, "");
  const data = await postJson(
    `${base}/chat/completions`,
    { Authorization: `Bearer ${req.apiKey}` },
    {
      model: req.model,
      messages: toMessages(req.system, req.messages),
      // OpenAI's newer models only take max_completion_tokens; other servers only know max_tokens.
      ...(compatible ? { max_tokens: req.maxTokens } : { max_completion_tokens: req.maxTokens }),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
    },
    req.signal,
  );
  const message = data?.choices?.[0]?.message ?? {};
  return {
    text: (message.content ?? "").toString().trim(),
    toolCalls: (message.tool_calls ?? []).map((c: any, i: number) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function?.arguments || "{}");
      } catch {
        // a malformed call is reported back to the model as an empty one
      }
      return { id: c.id ?? `call-${i}`, name: c.function?.name ?? "", args };
    }),
    inputTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
  };
}
