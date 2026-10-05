"use client";

import { useEffect, useState } from "react";

// Cookie consent, kept in the browser. Analytics (Yandex Metrica) starts only
// after it is given.
const KEY = "plano.cookie-consent";
const EVENT = "plano:cookie-consent";

export function hasConsent() {
  try {
    return localStorage.getItem(KEY) === "accepted";
  } catch {
    return false;
  }
}

export function giveConsent() {
  try {
    localStorage.setItem(KEY, "accepted");
  } catch {
    // Private mode: the banner simply shows again next time.
  }
  window.dispatchEvent(new Event(EVENT));
}

// null until read on the client (avoids a flash during hydration).
export function useConsent() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    setOk(hasConsent());
    const on = () => setOk(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return ok;
}
