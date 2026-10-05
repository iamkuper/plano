import type { AgentProvider } from "@plano/shared";

// What every provider adapter speaks: one request shape and one response
// shape, so the agent loop does not care whose model answers.
export interface ToolDef {
  name: string;
  description: string;
  // JSON Schema subset understood by all providers (type, properties, required, enum, items, description).
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMsg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: { id: string; name: string; content: string }[] };

export interface LlmRequest {
  provider: AgentProvider;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  system: string;
  messages: ChatMsg[];
  tools: ToolDef[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface LlmResponse {
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
}

// A failure of the model call. The message never contains the API key.
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
