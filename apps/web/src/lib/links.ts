// "acme.ru" → "https://acme.ru"; leaves full URLs alone.
export function normalizeUrl(value: string) {
  const v = value.trim();
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

// Compact label for a link: host + path without protocol, "www." or a trailing slash.
export function displayUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}
