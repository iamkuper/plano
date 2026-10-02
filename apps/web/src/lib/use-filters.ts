"use client";

import { useEffect, useState } from "react";
import { DEFAULT_FILTERS, type CardFilters } from "./card-filters";

// Board filters, remembered per page (e.g. per project) in this browser.
export function useFilters(storageKey: string) {
  const [filters, setFilters] = useState<CardFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setFilters(saved ? { ...DEFAULT_FILTERS, ...JSON.parse(saved) } : DEFAULT_FILTERS);
    } catch {
      setFilters(DEFAULT_FILTERS);
    }
  }, [storageKey]);

  function update(next: CardFilters) {
    setFilters(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  }

  return [filters, update] as const;
}
