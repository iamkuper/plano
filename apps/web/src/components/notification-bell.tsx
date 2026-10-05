"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Clock } from "lucide-react";
import { cardKey, type NotificationDto, t } from "@plano/shared";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/card-filters";
import { useRealtime } from "@/lib/realtime";
import { Avatar } from "./avatar";
import { Popover, Tooltip } from "./ui";

const VERB: Record<NotificationDto["type"], string> = {
  ASSIGNED: t("notificationBell.assignedYouTo"),
  MENTIONED: t("notificationBell.mentionedYouIn"),
  COMMENTED: t("notificationBell.wroteIn"),
  DUE_SOON: "",
  OVERDUE: "",
};

const SYSTEM_TEXT: Partial<Record<NotificationDto["type"], string>> = {
  DUE_SOON: t("notificationBell.dueSoon"),
  OVERDUE: t("notificationBell.overdue"),
};

// Sidebar bell: assignments, @mentions and messages on your cards. Updates
// live via the personal socket room.
export function NotificationBell({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api
      .notifications()
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRealtime(null, { "notifications:changed": load });

  const button = (open: boolean, toggle: () => void) => (
    <button
      onClick={toggle}
      aria-expanded={open}
      aria-label={unread ? t("notificationBell.notificationsNew", { unread }) : t("notificationBell.notifications")}
      className="relative grid size-7 place-items-center rounded-md text-chrome-ink-faint transition-colors hover:bg-chrome-hover hover:text-chrome-ink"
    >
      <Bell size={16} strokeWidth={1.75} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold leading-none text-white ring-2 ring-chrome">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  return (
    <Popover
      align="left"
      trigger={(open, toggle) => (compact ? <Tooltip label={t("notificationBell.notifications")}>{button(open, toggle)}</Tooltip> : button(open, toggle))}
    >
      {(close) => (
        <div className="w-[340px]">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-sm font-medium">{t("notificationBell.notifications")}</span>
            {unread > 0 && (
              <button onClick={() => api.markNotificationsRead().then(load)} className="text-xs text-accent hover:underline">
                
                {t("notificationBell.markAllAsRead")}
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-ink-faint">{t("notificationBell.nothingNewYet")}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    close();
                    if (!n.readAt) api.markNotificationsRead([n.id]).then(load);
                    router.push(`/projects/${n.card.projectId}?card=${n.card.id}`);
                  }}
                  className="flex w-full gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-soft"
                >
                  {n.actor ? <Avatar user={n.actor} size={24} /> : <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-faint"><Clock size={13} strokeWidth={1.75} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-5">
                      {n.actor ? <span className="font-medium">{n.actor.name}</span> : null}{" "}
                      <span className="text-ink-soft">{n.actor ? VERB[n.type] : SYSTEM_TEXT[n.type]}</span>{" "}
                      <span className="font-medium">
                        {cardKey(n.card)} {n.card.title}
                      </span>
                    </span>
                    {n.text && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-faint">{n.text}</span>}
                    <span className="mt-0.5 block text-xs text-ink-ghost">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span aria-label={t("notificationBell.new")} className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
