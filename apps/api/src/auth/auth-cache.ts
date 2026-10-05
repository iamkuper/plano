import type { AuthenticatedUser } from "./current-user.decorator";

// The auth check runs on every request and needs a few queries (user, role,
// subscription, seats). Its result is kept for a few seconds per user/token.
// Any write to the tables it reads empties the cache at once (see
// SystemPrismaService), so a deactivated user or a changed role takes effect
// immediately in this process; with several API processes the delay is at most
// the TTL. AUTH_CACHE_MS=0 turns it off.
const entries = new Map<string, { at: number; user: AuthenticatedUser }>();
let generation = 0;

const ttl = () => {
  const v = Number(process.env.AUTH_CACHE_MS);
  return Number.isFinite(v) && process.env.AUTH_CACHE_MS !== undefined && process.env.AUTH_CACHE_MS !== "" ? v : 3000;
};

export const authCacheKey = (userId: string, tokenId?: string) => `${userId}:${tokenId ?? ""}`;

export function getAuth(key: string): AuthenticatedUser | undefined {
  const limit = ttl();
  if (limit <= 0) return undefined;
  const hit = entries.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > limit) {
    entries.delete(key);
    return undefined;
  }
  return hit.user;
}

// `since` is the generation read before the data was loaded: if a write
// happened meanwhile, the data may already be stale and isn't kept.
export const authGeneration = () => generation;
export function putAuth(key: string, user: AuthenticatedUser, since: number) {
  if (ttl() <= 0 || since !== generation) return;
  if (entries.size > 5000) entries.clear();
  entries.set(key, { at: Date.now(), user });
}

export function clearAuthCache() {
  generation++;
  entries.clear();
}

// Tables the auth check depends on.
export const AUTH_MODELS = new Set(["User", "Role", "Subscription", "Workspace", "ApiToken", "Plan"]);
