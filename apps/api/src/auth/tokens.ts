import { createHash, randomBytes } from "crypto";

// Link tokens: random, URL-safe; only the hash is stored.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
