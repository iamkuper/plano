"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { onToast, type ToastItem } from "@/lib/toast";

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      onToast((t) => {
        setItems((list) => [...list.slice(-2), t]);
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== t.id)), t.tone === "error" ? 6000 : 3000);
      }),
    [],
  );

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[360px] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 text-base shadow-raised"
        >
          {t.tone === "error" ? (
            <AlertCircle size={17} className="mt-px shrink-0 text-danger" />
          ) : (
            <CheckCircle2 size={17} className="mt-px shrink-0 text-success" />
          )}
          <span className="flex-1">{t.message}</span>
          <button
            aria-label="Закрыть уведомление"
            onClick={() => setItems((list) => list.filter((i) => i.id !== t.id))}
            className="text-ink-ghost hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
