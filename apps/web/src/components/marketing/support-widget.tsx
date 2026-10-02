"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { SUPPORT } from "@/lib/support";

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

// Floating "chat with us" button, bottom-right on the public pages. Hidden
// when no Telegram or WhatsApp contact is configured.
export function SupportWidget() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!SUPPORT.telegram && !SUPPORT.whatsapp) return null;

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div role="dialog" aria-label="Чат с поддержкой" className="animate-dialog-in w-[280px] rounded-2xl border border-border bg-surface p-4 shadow-raised">
          <div className="flex items-start gap-3">
            <img src="/plano.svg" alt="" className="size-9 rounded-xl" />
            <div>
              <div className="font-medium">Напишите нам</div>
              <p className="mt-0.5 text-sm text-ink-faint">Ответим на вопросы о Plano, поможем с настройкой и тарифом.</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {SUPPORT.telegram && (
              <a
                href={SUPPORT.telegram}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#229ED9] text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <TelegramIcon /> Telegram
              </a>
            )}
            {SUPPORT.whatsapp && (
              <a
                href={SUPPORT.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <WhatsAppIcon /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Закрыть чат" : "Написать в поддержку"}
        className="group relative grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-black/20 transition-transform hover:scale-105"
      >
        {!open && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/40 [animation-duration:2.5s] motion-reduce:hidden" />}
        {open ? <X size={22} /> : <MessageCircle size={24} strokeWidth={1.75} />}
      </button>
    </div>
  );
}
