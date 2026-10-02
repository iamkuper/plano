"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// A piece of UI state kept in the URL query (?card=…, ?view=…, ?tab=…) so it
// survives reloads and can be shared as a link.
export function useQueryParam(name: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(name);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set(name, next);
      else params.delete(name);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, name],
  );

  return [value, setValue] as const;
}

// The open card (?card=<id>), like Jira/Linear issue URLs.
export function useCardParam() {
  return useQueryParam("card");
}
