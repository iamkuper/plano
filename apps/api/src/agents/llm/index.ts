import { anthropic } from "./anthropic";
import { google } from "./google";
import { openai } from "./openai";
import type { LlmRequest, LlmResponse } from "./types";

export * from "./types";
export { assertPublicUrl } from "./http";

export function complete(req: LlmRequest): Promise<LlmResponse> {
  switch (req.provider) {
    case "ANTHROPIC":
      return anthropic(req);
    case "GOOGLE":
      return google(req);
    default:
      return openai(req);
  }
}
