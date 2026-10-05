"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import type { TemplateListItemDto, UserDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { useSettings } from "@/lib/settings";
import { can, t } from "@plano/shared";
import { Button, EmptyState, PageHeader, TableSkeleton } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { api } from "@/lib/api";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateListItemDto[] | null>(null);
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    api.templates().then(setTemplates).catch(() => setTemplates([]));
    api.me().then(setMe).catch(() => {});
  }, []);

  const settings = useSettings();
  const createButton = can(me, "templates.manage") && (
    <Link href="/settings/templates/new">
      <Button variant="primary">
        <Plus size={15} />  {t("common.newTemplate")}
      </Button>
    </Link>
  );

  return (
    <AppShell>
      <PageHeader title={t("common.settings")} meta={<SettingsTabs />} actions={createButton} />
      <div className="py-5">
        {!templates && <TableSkeleton rows={3} />}
        {templates?.length === 0 && (
          <EmptyState icon={LayoutTemplate} title={t("settings.templates.noTemplatesYet")} action={createButton}>
            
            {t("settings.templates.aTemplateIsBoardStages")}
          </EmptyState>
        )}
        {templates && templates.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border">
            {templates.map((tpl) => (
              <Link
                key={tpl.id}
                href={`/settings/templates/${tpl.id}`}
                className="flex items-center gap-4 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-soft"
              >
                <LayoutTemplate size={18} strokeWidth={1.75} className="shrink-0 text-ink-ghost" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{tpl.name}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                    {tpl.columns.map((c, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full" style={{ background: stageColor(i, tpl.columns.length) }} />
                        {c}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-ink-faint">
                  {t("plural.cards", { count: tpl._count.cards })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
