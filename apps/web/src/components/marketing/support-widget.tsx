"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { currentLocale, type Locale } from "@plano/shared";
import { makeTr } from "@/lib/marketing";
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

const TEASER_KEY = "plano.chat-teaser-closed";

function ManagerAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <img src="/manager.jpg" alt={name} className="size-full rounded-full object-cover" />
      <span aria-hidden className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-[#2FA36B]" />
    </span>
  );
}

// Floating "chat with us" button, bottom-right on the public pages: a
// manager's greeting with Telegram / WhatsApp links, and a short teaser
// bubble a few seconds after the page opens. Hidden when no contact is set.
// `locale` is set on the public pages; inside the app the interface language applies.
export function SupportWidget({ locale }: { locale?: Locale }) {
  const tr = makeTr(locale ?? currentLocale());
  const MANAGER = { name: tr("mk.supportWidget.pavel"), role: tr("mk.supportWidget.planoManager") };
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(true);
  const [teaser, setTeaser] = useState(false);
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

  // "Typing…" for a moment, then the greeting.
  useEffect(() => {
    if (!open) return;
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 900);
    return () => clearTimeout(t);
  }, [open]);

  // Teaser once per browser session, unless closed before.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(TEASER_KEY)) return;
    } catch {}
    const t = setTimeout(() => setTeaser(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const closeTeaser = () => {
    setTeaser(false);
    try {
      sessionStorage.setItem(TEASER_KEY, "1");
    } catch {}
  };

  if (!SUPPORT.telegram && !SUPPORT.whatsapp) return null;

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div role="dialog" aria-label={tr("mk.supportWidget.supportChat")} className="animate-dialog-in w-[300px] overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
          <div className="flex items-center gap-3 bg-[#2B2F33] px-4 py-3 text-white">
            <ManagerAvatar name={MANAGER.name} />
            <div className="min-w-0">
              <div className="font-medium">{MANAGER.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-[#CDD0D4]">
                <span className="relative flex size-2">
                  <span className="lp-pulse absolute inset-0 rounded-full bg-[#2FA36B]" />
                  <span className="relative size-2 rounded-full bg-[#2FA36B]" />
                </span>
                {MANAGER.role}  {tr("mk.supportWidget.online")}
              </div>
            </div>
          </div>
          <div className="space-y-2 bg-surface-soft px-4 py-4 text-sm">
            {typing ? (
              <div className="inline-flex items-center gap-1 rounded-2xl rounded-tl-md bg-surface px-3 py-2.5 text-ink-ghost shadow-sm">
                <span className="lp-typing">
                  <span>•</span>
                  <span>•</span>
                  <span>•</span>
                </span>
              </div>
            ) : (
              <>
                <div className="lp-rise max-w-[90%] rounded-2xl rounded-tl-md bg-surface px-3 py-2 shadow-sm">{tr("mk.supportWidget.helloIMILl", { name: MANAGER.name })}</div>
                <div className="lp-rise max-w-[90%] rounded-2xl rounded-tl-md bg-surface px-3 py-2 shadow-sm" style={{ animationDelay: "250ms" }}>
                  
                  {tr("mk.supportWidget.iCanTellYouAbout")}
                </div>
              </>
            )}
          </div>
          <div className="space-y-2 p-4 pt-3">
            {SUPPORT.telegram && (
              <a
                href={SUPPORT.telegram}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#229ED9] text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <TelegramIcon />  {tr("mk.supportWidget.writeOnTelegram")}
              </a>
            )}
            {SUPPORT.whatsapp && (
              <a
                href={SUPPORT.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                <WhatsAppIcon />  {tr("mk.supportWidget.writeOnWhatsapp")}
              </a>
            )}
          </div>
        </div>
      )}
      {!open && teaser && (
        <div className="lp-rise relative flex max-w-[260px] items-start gap-2.5 rounded-2xl rounded-br-md border border-border bg-surface p-3 pr-8 text-sm shadow-raised">
          <ManagerAvatar name={MANAGER.name} size={32} />
          <button onClick={() => (closeTeaser(), setOpen(true))} className="text-left">
            <span className="block font-medium">{MANAGER.name}</span>
            <span className="text-ink-faint">{tr("mk.supportWidget.questionsAboutPlanoWriteI")}</span>
          </button>
          <button onClick={closeTeaser} aria-label={tr("onboarding.hide")} className="absolute right-2 top-2 grid size-5 place-items-center rounded-full text-ink-ghost hover:bg-surface-soft hover:text-ink">
            <X size={12} />
          </button>
        </div>
      )}
      <button
        onClick={() => {
          setOpen((o) => !o);
          closeTeaser();
        }}
        aria-expanded={open}
        aria-label={open ? tr("mk.supportWidget.closeChat") : tr("mk.supportWidget.contactSupport")}
        className="group relative grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-black/20 transition-transform hover:scale-105"
      >
        {!open && <span aria-hidden className="lp-pulse absolute inset-0 rounded-full bg-accent" />}
        {open ? <X size={22} /> : <MessageCircle size={24} strokeWidth={1.75} />}
        {!open && <span aria-hidden className="absolute right-0.5 top-0.5 size-3.5 rounded-full border-2 border-bg bg-[#2FA36B]" />}
      </button>
    </div>
  );
}
