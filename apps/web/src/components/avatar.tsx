import { Bot } from "lucide-react";
import { series } from "@/design/tokens";

function colorFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return series[Math.abs(hash) % series.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// People: tinted circle with initials in a stable series colour. The tint is
// opaque (mixed with white) so overlapping avatars never show through.
export function Avatar({ user, size = 24 }: { user: { id: string; name: string; avatarUrl?: string | null; kind?: "HUMAN" | "AGENT" }; size?: number }) {
  const color = colorFor(user.id);
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={user.name}
      aria-label={user.name}
      role="img"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4), background: `color-mix(in srgb, ${color} 14%, #ffffff)`, color }}
    >
      {user.kind === "AGENT" ? <Bot size={Math.round(size * 0.6)} strokeWidth={2} aria-hidden /> : initials(user.name) || "?"}
    </span>
  );
}

// Organisations: bordered square with a letter (the Kpi icon-tile look).
export function LetterMark({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center border border-border bg-surface font-semibold text-ink-soft"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.5), borderRadius: size <= 18 ? 4 : 6 }}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

// Overlapping row of avatars: each next person lies on top of the previous
// one (natural reading order), with a ring in the background colour between
// them — photos included. Extra people collapse into a "+N" chip on top.
export function AvatarStack({
  users,
  size = 20,
  max = 3,
  ring = "ring-surface",
}: {
  users: { id: string; name: string; avatarUrl?: string | null }[];
  size?: number;
  max?: number;
  ring?: string;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  const overlap = Math.round(size * 0.3);
  return (
    <span className="flex items-center" title={users.map((u) => u.name).join(", ")}>
      {shown.map((u, i) => (
        <span
          key={u.id}
          className={`relative inline-flex shrink-0 rounded-full ring-2 ${ring}`}
          style={{ zIndex: i + 1, marginLeft: i === 0 ? 0 : -overlap }}
        >
          <Avatar user={u} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-surface-sunken font-medium text-ink-faint ring-2 ${ring}`}
          style={{ zIndex: shown.length + 1, width: size, height: size, marginLeft: -overlap, fontSize: Math.max(10, size * 0.42) }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
