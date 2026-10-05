"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, EmptyState, PageHeader, Panel, Segmented, td, th, tr, TableSkeleton } from "@/components/ui";
import { api, type AuditEntryDto } from "@/lib/api";
import { t, intlTag } from "@plano/shared";
const GROUPS = [
  { value: "", label: t("common.all") },
  { value: "project", label: t("common.projects") },
  { value: "user", label: t("common.staff") },
  { value: "role", label: t("settings.audit.roles") },
  { value: "billing", label: t("settings.audit.billing") },
  { value: "card", label: t("common.cards2") },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString(intlTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AuditPage() {
  const [group, setGroup] = useState("");
  const [items, setItems] = useState<AuditEntryDto[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (before?: string) => {
      try {
        const page = await api.audit(before, group || undefined);
        setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
        setNext(page.next);
        setLocked(false);
        setError(null);
      } catch (e) {
        const message = (e as Error).message;
        if (message.includes("Business")) setLocked(true);
        else setError(message);
        setItems([]);
      } finally {
        setMore(false);
      }
    },
    [group],
  );
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  return (
    <AppShell>
      <PageHeader title={t("common.settings")} meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        {locked ? (
          <EmptyState
            icon={ScrollText}
            title={t("settings.audit.theActivityLogIsAvailable")}
            action={
              <Link href="/settings/billing">
                <Button variant="primary">{t("common.viewPlans")}</Button>
              </Link>
            }
          >
            
            {t("settings.audit.whoCreatedChangedOrDeleted")}
          </EmptyState>
        ) : (
          <>
            <Segmented label={t("settings.audit.section")} value={group} onChange={setGroup} options={GROUPS} />
            {error && <p className="text-sm text-danger">{error}</p>}
            {!items ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-faint">{error ? "" : t("settings.audit.noEntriesYet")}</p>
            ) : (
              <Panel className="overflow-hidden">
                <table className="w-full border-collapse">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>{t("settings.audit.when")}</th>
                      <th className={th}>{t("settings.audit.who")}</th>
                      <th className={th}>{t("settings.audit.whatWasDone")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className={tr}>
                        <td className={`${td} whitespace-nowrap text-ink-faint`}>{when(i.createdAt)}</td>
                        <td className={td}>
                          {i.user ? (
                            <span className="flex items-center gap-2">
                              <Avatar user={i.user} size={20} /> {i.user.name}
                            </span>
                          ) : (
                            <span className="text-ink-faint">{t("settings.audit.system")}</span>
                          )}
                        </td>
                        <td className={td}>{i.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
            {next && (
              <div className="flex justify-center">
                <Button
                  loading={more}
                  onClick={() => {
                    setMore(true);
                    load(next);
                  }}
                >
                  
                  {t("common.showMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
