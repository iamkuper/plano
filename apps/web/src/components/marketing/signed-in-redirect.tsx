"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

// The landing renders on the server for everyone (search engines included);
// signed-in visitors are sent straight to the app.
export function SignedInRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);
  return null;
}
