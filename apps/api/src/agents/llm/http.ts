import { LlmError } from "./types";

const PRIVATE_HOST = /^(localhost|.*\.(local|internal|localdomain)|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?(::1?|fc|fd|fe80))/i;

// A customer-supplied address must not let the server reach its own network.
// (Set AGENTS_ALLOW_PRIVATE_URLS=1 to try a local model server in development.)
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LlmError("invalid base URL");
  }
  if (process.env.AGENTS_ALLOW_PRIVATE_URLS === "1") return url;
  if (url.protocol !== "https:") throw new LlmError("base URL must use https");
  if (PRIVATE_HOST.test(url.hostname)) throw new LlmError("base URL points to a private address");
  return url;
}

const clip = (s: string) => (s.length > 300 ? `${s.slice(0, 299)}…` : s);

// POSTs JSON and returns the parsed body; provider errors become LlmError.
export async function postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new LlmError(e instanceof Error && e.name === "TimeoutError" ? "the model did not answer in time" : "the model service is unreachable");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const detail = data?.error?.message ?? data?.error ?? data?.message ?? text;
    throw new LlmError(clip(`${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`), res.status);
  }
  return data;
}
