"use client";

import { useEffect, useState } from "react";
import type { TaskTypeDto } from "@plano/shared";
import { api, onSessionChange } from "./api";

// Task types of the workspace, loaded once per page.
let cache: Promise<TaskTypeDto[]> | null = null;
onSessionChange(() => (cache = null));
export function loadTaskTypes(force = false) {
  if (!cache || force) cache = api.taskTypes().catch((e) => ((cache = null), Promise.reject(e)));
  return cache;
}

export function useTaskTypes() {
  const [types, setTypes] = useState<TaskTypeDto[]>([]);
  useEffect(() => {
    loadTaskTypes().then(setTypes).catch(() => {});
  }, []);
  return types;
}
