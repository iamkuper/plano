"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserDto } from "@plano/shared";
import { currentLocale } from "@plano/shared";
import { setUiLanguage } from "@/components/locale-gate";
import { api, getToken, UnauthorizedError } from "./api";

const ME_CHANGED = "plano:me-changed";

// Call after the profile is saved so the sidebar picks up the new name/photo.
export function notifyMeChanged(user: UserDto) {
  window.dispatchEvent(new CustomEvent<UserDto>(ME_CHANGED, { detail: user }));
}

// Client-side guard for app pages: redirects to /login without a valid token.
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api.me().then((me) => {
      // The account's language wins over whatever this browser last used.
      if (me.locale && me.locale !== currentLocale()) setUiLanguage(me.locale);
      else setUser(me);
    }, (err) => {
      if (err instanceof UnauthorizedError) router.replace("/login");
    });
    const onChange = (e: Event) => setUser((e as CustomEvent<UserDto>).detail);
    window.addEventListener(ME_CHANGED, onChange);
    return () => window.removeEventListener(ME_CHANGED, onChange);
  }, [router]);

  return user;
}
