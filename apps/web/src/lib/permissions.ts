"use client";

import { useEffect, useState } from "react";
import { can, type Permission, type UserDto } from "@amo-kanban/shared";
import { api, onSessionChange } from "./api";

let mePromise: Promise<UserDto> | null = null;
onSessionChange(() => (mePromise = null));

// `can(perm)` for the current user. Until the user loads it
// answers false, so restricted buttons appear rather than flash and vanish.
export function useCan() {
  const [me, setMe] = useState<UserDto | null>(null);
  useEffect(() => {
    mePromise ??= api.me();
    mePromise.then(setMe).catch(() => (mePromise = null));
  }, []);
  return (perm: Permission) => can(me, perm);
}
