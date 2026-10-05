// The command palette is opened from several places (⌘K, the search field,
// the "/" key): they all go through this event.
const OPEN = "plano:palette";

export const openPalette = () => window.dispatchEvent(new Event(OPEN));
export const onPaletteOpen = (fn: () => void) => {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
};

// Keystrokes meant for a text field must not trigger shortcuts.
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

// "g" then a letter jumps to a section.
export const GO_KEYS: Record<string, { href: string; label: string }> = {
  d: { href: "/dashboard", label: "palette.goHome" },
  p: { href: "/projects", label: "palette.goProjects" },
  t: { href: "/team", label: "palette.goTeam" },
  r: { href: "/reports/time", label: "palette.goTime" },
  s: { href: "/settings", label: "palette.goSettings" },
  u: { href: "/profile", label: "palette.goProfile" },
};
