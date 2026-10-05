"use client";

import { useEffect, useState } from "react";
import { setCardKeyPrefix, type SettingsDto } from "@plano/shared";
import { api, onSessionChange } from "./api";

// Workspace settings, fetched once per page load and shared by all callers.
const EVENT = "plano:settings-changed";
let cached: SettingsDto | null = null;
let inflight: Promise<SettingsDto> | null = null;
onSessionChange(() => {
  cached = null;
  inflight = null;
});

function apply(s: SettingsDto) {
  cached = s;
  setCardKeyPrefix(s.cardPrefix);
  return s;
}

export function loadSettings() {
  if (cached) return Promise.resolve(cached);
  inflight ??= api.settings().then(apply).finally(() => (inflight = null));
  return inflight;
}

// Call after saving so every screen re-renders with the new values.
export function publishSettings(s: SettingsDto) {
  apply(s);
  window.dispatchEvent(new CustomEvent<SettingsDto>(EVENT, { detail: s }));
}

export function useSettings() {
  const [settings, setSettings] = useState<SettingsDto | null>(cached);
  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    const onChange = (e: Event) => setSettings({ ...(e as CustomEvent<SettingsDto>).detail });
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return settings;
}
