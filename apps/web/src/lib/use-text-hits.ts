"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// Which cards contain the text of the board filter. Cards on a board don't
// carry their descriptions, so the server looks them up (also in titles and
// by key). Until the answer arrives the filter works on titles and keys.
export function useTextHits(q: string, projectId?: string): ReadonlySet<string> | null {
  const [hits, setHits] = useState<{ q: string; ids: Set<string> } | null>(null);
  const term = q.trim();

  useEffect(() => {
    if (!term) {
      setHits(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api
        .matchCards(term, projectId)
        .then((r) => live && setHits({ q: term, ids: new Set(r.ids) }))
        .catch(() => {});
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [term, projectId]);

  // An answer for an older text isn't used.
  return hits && hits.q === term ? hits.ids : null;
}
