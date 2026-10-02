// Minimal app-wide toasts: anything can call toast(), <Toaster /> renders.
export type ToastTone = "default" | "success" | "error";
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const EVENT = "amo-kanban:toast";
let seq = 0;

export function toast(message: string, tone: ToastTone = "default") {
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT, { detail: { id: ++seq, message, tone } }));
}

export function onToast(handler: (t: ToastItem) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<ToastItem>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
