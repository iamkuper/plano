import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// API keys are sealed with AES-256-GCM. The key comes from AGENT_SECRET_KEY
// (falls back to JWT_SECRET, so rotating that secret invalidates stored keys).
const key = () => createHash("sha256").update(process.env.AGENT_SECRET_KEY ?? process.env.JWT_SECRET ?? "change-me-in-production").digest();

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function open(sealed: string): string {
  if (!sealed.startsWith("v1:")) throw new Error("unknown key format");
  const raw = Buffer.from(sealed.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// What the interface shows instead of the key.
export const keyHint = (plain: string) => (plain.length <= 8 ? "••••" : `…${plain.slice(-4)}`);
