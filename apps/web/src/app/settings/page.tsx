"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, X } from "lucide-react";
import type { SettingsDto, UserDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Field, IconButton, Input, PageHeader } from "@/components/ui";
import { stageColor } from "@/design/tokens";
import { api } from "@/lib/api";
import { publishSettings, useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { t } from "@plano/shared";
function useSave(onSaved: (s: SettingsDto) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(patch: Partial<SettingsDto>, done: string) {
    setError(null);
    setBusy(true);
    try {
      onSaved(await api.updateSettings(patch));
      toast(done, "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, save };
}

function WorkspaceSection({ settings, canEdit, onSaved }: { settings: SettingsDto; canEdit: boolean; onSaved: (s: SettingsDto) => void }) {
  const [name, setName] = useState(settings.workspaceName);
  const { busy, error, setError, save } = useSave(onSaved);
  const dirty = name.trim() !== settings.workspaceName;
  return (
    <Card title={t("settings.workspace")} description={t("settings.theNameIsShownIn")}>
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setError(t("common.enterAName2"));
          save({ workspaceName: name.trim() }, t("settings.nameSaved"));
        }}
      >
        <img src="/plano.svg" alt="" aria-hidden className="mb-1 size-7 shrink-0 rounded-md" />
        <div className="flex-1">
          <Field label={t("common.name2")} error={error}>
            {(a) => <Input {...a} maxLength={40} disabled={!canEdit} invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
        </div>
        {canEdit && (
          <Button variant="primary" loading={busy} disabled={!dirty}>
            
            {t("common.save")}
          </Button>
        )}
      </form>
    </Card>
  );
}

// The account ID: quoted in bank-transfer invoices and when writing to support.
function AccountIdSection({ id }: { id: string }) {
  return (
    <Card title={t("settings.accountId")} description={t("settings.quoteItInThePayment")}>
      <div className="flex items-center gap-2">
        <code className="rounded-md border border-border bg-surface-soft px-2.5 py-1.5 font-mono text-sm">{id}</code>
        <Button
          variant="ghost"
          onClick={() =>
            navigator.clipboard
              ?.writeText(id)
              .then(() => toast(t("settings.idCopied"), "success"))
              .catch(() => toast(t("settings.couldNotCopy"), "error"))
          }
        >
          <Copy size={14} />  {t("settings.users.copy")}
        </Button>
      </div>
    </Card>
  );
}

function PrefixSection({ settings, canEdit, onSaved }: { settings: SettingsDto; canEdit: boolean; onSaved: (s: SettingsDto) => void }) {
  const [prefix, setPrefix] = useState(settings.cardPrefix);
  const { busy, error, setError, save } = useSave(onSaved);
  const clean = prefix.trim().toUpperCase();
  const valid = /^[A-ZА-ЯЁ0-9]{1,6}$/.test(clean);
  return (
    <Card title={t("settings.cardNumbers")} description={t("settings.thePrefixInEveryCard")}>
      <form
        className="flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return setError(t("settings.1To6LettersOr"));
          save({ cardPrefix: clean }, t("settings.prefixSaved"));
        }}
      >
        <div className="w-40">
          <Field label={t("settings.prefix")} error={error}>
            {(a) => (
              <Input
                {...a}
                maxLength={6}
                disabled={!canEdit}
                invalid={!!error}
                className="uppercase"
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value);
                  setError(null);
                }}
              />
            )}
          </Field>
        </div>
        <div className="mb-1.5 flex-1 text-sm text-ink-faint">
          
          {t("settings.itWillLookLikeThis")} <span className="font-medium text-ink">{valid ? clean : settings.cardPrefix}-12</span>
        </div>
        {canEdit && (
          <Button variant="primary" loading={busy} disabled={clean === settings.cardPrefix}>
            
            {t("common.save")}
          </Button>
        )}
      </form>
    </Card>
  );
}

function StagesSection({ settings, canEdit, onSaved }: { settings: SettingsDto; canEdit: boolean; onSaved: (s: SettingsDto) => void }) {
  const [stages, setStages] = useState(settings.defaultColumns);
  const [draft, setDraft] = useState("");
  const { busy, error, setError, save } = useSave(onSaved);
  const cleaned = stages.map((s) => s.trim()).filter(Boolean);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(settings.defaultColumns);

  function move(i: number, dir: -1 | 1) {
    setStages((list) => {
      const next = [...list];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  }

  return (
    <Card
      title={t("settings.defaultStages")}
      description={t("settings.newProjectsWithoutATemplate")}
      bodyClassName="p-4 pt-3"
    >
      <div className="overflow-hidden rounded-lg border border-border">
        {stages.map((stage, i) => (
          <div key={i} className="flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0">
            <span className="h-5 w-1 rounded-full" style={{ background: stageColor(i, stages.length) }} />
            <Input
              aria-label={t("common.stage", { value: i + 1 })}
              disabled={!canEdit}
              value={stage}
              onChange={(e) => setStages((list) => list.map((s, j) => (j === i ? e.target.value : s)))}
            />
            {canEdit && (
              <div className="flex shrink-0 items-center">
                <IconButton size="sm" title={t("common.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={14} />
                </IconButton>
                <IconButton size="sm" title={t("common.down")} disabled={i === stages.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={14} />
                </IconButton>
                <IconButton
                  size="sm"
                  title={stages.length <= 1 ? t("common.atLeastOneStageIs") : t("common.removeStage")}
                  disabled={stages.length <= 1}
                  onClick={() => setStages((list) => list.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </IconButton>
              </div>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim() || stages.length >= 12) return;
              setStages((list) => [...list, draft.trim()]);
              setDraft("");
            }}
          >
            <div className="flex-1">
              <Input aria-label={t("common.newStage")} placeholder={t("common.newStage")} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </div>
            <Button type="submit" disabled={!draft.trim() || stages.length >= 12}>
              <Plus size={15} />  {t("common.add")}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setStages(settings.defaultColumns)}>
                
                {t("common.discardChanges")}
              </Button>
            )}
            <Button
              variant="primary"
              loading={busy}
              disabled={!dirty}
              onClick={() => (cleaned.length ? save({ defaultColumns: cleaned }, t("settings.stagesSaved")) : setError(t("common.atLeastOneStageIs")))}
            >
              
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  const canEdit = me?.role === "ADMIN";

  return (
    <AppShell>
      <PageHeader title={t("common.settings")} meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        {me && !canEdit && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">
            
            {t("settings.generalSettingsCanBeChanged")}
          </p>
        )}
        {settings && me ? (
          <>
            {settings.accountNumber && <AccountIdSection id={String(settings.accountNumber)} />}
            <WorkspaceSection key={`w-${settings.workspaceName}`} settings={settings} canEdit={canEdit} onSaved={publishSettings} />
            <PrefixSection key={`p-${settings.cardPrefix}`} settings={settings} canEdit={canEdit} onSaved={publishSettings} />
            <StagesSection key={`s-${settings.defaultColumns.join("|")}`} settings={settings} canEdit={canEdit} onSaved={publishSettings} />
          </>
        ) : (
          <div className="space-y-4" aria-busy="true">
            {[110, 110, 260].map((h, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-surface-soft" style={{ height: h }} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
