// Lets any screen tell the sidebar project list to refresh (after creating
// or changing a project) without a global store.
const EVENT = "amo-kanban:projects-changed";

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function onProjectsChanged(handler: () => void) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
