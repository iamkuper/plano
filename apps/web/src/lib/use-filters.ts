"use client";

import { useEffect, useMemo, useState } from "react";
import { useTextHits } from "./use-text-hits";
import { DEFAULT_FILTERS, type CardFilters } from "./card-filters";

// Board filters, remembered per page (e.g. per project) in this browser.
// The third value is for showing cards: the same filters plus the server's
// answer to the text search. Only the first two are stored.
export function useFilters(storageKey: string, projectId?: string) {
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

  const hits = useTextHits(filters.q, projectId);
  const effective = useMemo(() => ({ ...filters, hits }), [filters, hits]);

  return [filters, update, effective] as const;
}
