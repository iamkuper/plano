"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, getToken } from "./api";

// One socket per tab. Rooms are re-joined after a reconnect.
let socket: Socket | null = null;
const rooms = new Map<string, number>(); // room → subscriber count

function getSocket() {
  if (socket) return socket;
  socket = io(API_URL, { auth: (cb) => cb({ token: getToken() }), transports: ["websocket"] });
  socket.on("connect", () => rooms.forEach((_, room) => socket!.emit("join", room)));
  return socket;
}

// Subscribe to server events, optionally inside rooms ("project:<id>",
// "card:<id>"). Handlers can change between renders without resubscribing.
// Handlers receive the event's data (for example which card changed).
export function useRealtime(room: string | string[] | null, handlers: Record<string, (data?: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const events = Object.keys(handlers).sort().join("|");
  const roomKey = (Array.isArray(room) ? [...room].sort() : room ? [room] : []).join(",");

  useEffect(() => {
    if (!getToken()) return;
    const s = getSocket();
    const joined = roomKey ? roomKey.split(",") : [];
    for (const r of joined) {
      rooms.set(r, (rooms.get(r) ?? 0) + 1);
      if (s.connected) s.emit("join", r);
    }
    const listeners = events.split("|").filter(Boolean).map((event) => {
      const fn = (data?: unknown) => ref.current[event]?.(data);
      s.on(event, fn);
      return [event, fn] as const;
    });
    return () => {
      listeners.forEach(([event, fn]) => s.off(event, fn));
      for (const r of joined) {
        const n = (rooms.get(r) ?? 1) - 1;
        if (n <= 0) {
          rooms.delete(r);
          s.emit("leave", r);
        } else rooms.set(r, n);
      }
    };
  }, [roomKey, events]);
}

// Coalesces bursts of events (e.g. a drag fires move + reorder) into one call.
export function useDebounced(fn: () => void, ms = 250) {
  const ref = useRef(fn);
  ref.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current(), ms);
  };
}
