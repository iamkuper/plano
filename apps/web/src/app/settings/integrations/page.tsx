"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, History, KeyRound, Pencil, Plus, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { intlTag, t, WEBHOOK_EVENTS, type ApiTokenDto, type WebhookDeliveryDto, type WebhookDto, type WebhookEvent } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const when = (iso: string) => new Date(iso).toLocaleString(intlTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A secret that is shown once, with a copy button.
function SecretBox({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface-soft px-2.5 py-2 text-xs" data-testid="secret">
        {value}
      </code>
      <IconButton aria-label={t("common.copy")} onClick={() => copyText(value)}>
        <Copy size={15} />
      </IconButton>
    </div>
  );
}

function TokenDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t("settings.integrations.enterTokenName"));
    setBusy(true);
    try {
      const created = await api.createApiToken(name.trim());
      setToken(created.token);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return token ? (
    <Dialog title={t("settings.integrations.tokenCreated")} description={t("settings.integrations.tokenShownOnce")} onClose={onClose}>
      <SecretBox value={token} />
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      </div>
    </Dialog>
  ) : (
    <Dialog title={t("settings.integrations.newToken")} description={t("settings.integrations.newTokenHint")} onClose={onClose}>
      <form onSubmit={create} className="space-y-4">
        <Field label={t("common.name2")} error={error ?? undefined}>
          {(a) => <Input {...a} autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("settings.integrations.tokenPlaceholder")} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {t("settings.integrations.createToken")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const EVENT_LABELS = (): Record<WebhookEvent, string> => ({
  "card.created": t("settings.integrations.eventCardCreated"),
  "card.updated": t("settings.integrations.eventCardUpdated"),
  "card.moved": t("settings.integrations.eventCardMoved"),
  "card.deleted": t("settings.integrations.eventCardDeleted"),
  "comment.created": t("settings.integrations.eventCommentCreated"),
});

function WebhookDialog({ hook, onClose, onSaved }: { hook?: WebhookDto; onClose: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(hook?.url ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>(hook?.events ?? []);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = EVENT_LABELS();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (hook) {
        await api.updateWebhook(hook.id, { url: url.trim(), events });
        onSaved();
        onClose();
      } else {
        const created = await api.createWebhook({ url: url.trim(), events });
        setSecret(created.secret);
        onSaved();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return secret ? (
    <Dialog title={t("settings.integrations.webhookCreated")} description={t("settings.integrations.secretShownOnce")} onClose={onClose}>
      <SecretBox value={secret} />
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      </div>
    </Dialog>
  ) : (
    <Dialog title={hook ? t("settings.integrations.editWebhook") : t("settings.integrations.newWebhook")} onClose={onClose} width="max-w-lg">
      <form onSubmit={save} className="space-y-4">
        <Field label={t("settings.integrations.webhookUrl")} hint={t("settings.integrations.webhookUrlHint")} error={error ?? undefined}>
          {(a) => <Input {...a} autoFocus type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/plano-hook" />}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-soft">{t("settings.integrations.events")}</legend>
          <p className="mb-2 text-xs text-ink-faint">{t("settings.integrations.eventsHint")}</p>
          <div className="space-y-1.5">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={events.includes(ev)} label={labels[ev]} onChange={() => setEvents((list) => (list.includes(ev) ? list.filter((x) => x !== ev) : [...list, ev]))} />
                {labels[ev]} <code className="text-xs text-ink-ghost">{ev}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {hook ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeliveriesDialog({ hook, onClose }: { hook: WebhookDto; onClose: () => void }) {
  const [rows, setRows] = useState<WebhookDeliveryDto[] | null>(null);
  useEffect(() => {
    api.webhookDeliveries(hook.id).then(setRows).catch(() => setRows([]));
  }, [hook.id]);
  return (
    <Dialog title={t("settings.integrations.deliveries")} description={hook.url} onClose={onClose} width="max-w-lg">
      {!rows ? null : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">{t("settings.integrations.noDeliveries")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
              <span>
                <code className="text-xs">{r.event}</code>{" "}
                <span className={r.ok ? "text-success" : "text-danger"}>{r.ok ? t("settings.integrations.delivered", { code: r.statusCode ?? "" }) : (r.error ?? t("settings.integrations.failed"))}</span>
                {r.attempts > 1 && <span className="text-xs text-ink-ghost"> · {t("settings.integrations.attempt", { count: r.attempts })}</span>}
              </span>
              <span className="shrink-0 text-xs text-ink-ghost">{when(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function TokensCard() {
  const [tokens, setTokens] = useState<ApiTokenDto[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ApiTokenDto | null>(null);
  const load = useCallback(() => {
    api.apiTokens().then(setTokens).catch(() => setTokens([]));
  }, []);
  useEffect(load, [load]);

  return (
    <Card
      title={t("settings.integrations.tokensTitle")}
      description={t("settings.integrations.tokensDescription")}
      action={
        <Button onClick={() => setCreating(true)}>
          <Plus size={15} /> {t("settings.integrations.newToken")}
        </Button>
      }
    >
      {!tokens ? null : tokens.length === 0 ? (
        <EmptyState icon={KeyRound} title={t("settings.integrations.noTokens")}>
          {t("settings.integrations.noTokensHint")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {tokens.map((k) => (
            <li key={k.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium">{k.name}</div>
                <div className="text-xs text-ink-ghost">
                  …{k.hint} · {t("settings.integrations.createdAt", { when: when(k.createdAt) })} · {k.lastUsedAt ? t("settings.integrations.usedAt", { when: when(k.lastUsedAt) }) : t("settings.integrations.neverUsed")}
                </div>
              </div>
              <IconButton aria-label={t("settings.integrations.revokeToken", { name: k.name })} onClick={() => setRemoving(k)}>
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-faint">
        {t("settings.integrations.docsLead")}{" "}
        <Link href={t("settings.integrations.docsHref")} className="text-accent hover:underline">
          {t("settings.integrations.docsLink")}
        </Link>
      </p>
      {creating && <TokenDialog onClose={() => setCreating(false)} onCreated={load} />}
      {removing && (
        <ConfirmDialog
          title={t("settings.integrations.revokeTitle", { name: removing.name })}
          body={t("settings.integrations.revokeBody")}
          confirmLabel={t("settings.integrations.revoke")}
          onConfirm={async () => {
            await api.deleteApiToken(removing.id).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  );
}

function WebhooksCard() {
  const [hooks, setHooks] = useState<WebhookDto[] | null>(null);
  const [editing, setEditing] = useState<WebhookDto | "new" | null>(null);
  const [log, setLog] = useState<WebhookDto | null>(null);
  const [removing, setRemoving] = useState<WebhookDto | null>(null);
  const [rotating, setRotating] = useState<WebhookDto | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const load = useCallback(() => {
    api.webhooks().then(setHooks).catch(() => setHooks([]));
  }, []);
  useEffect(load, [load]);
  const labels = EVENT_LABELS();

  async function test(h: WebhookDto) {
    try {
      const { ok } = await api.testWebhook(h.id);
      toast(ok ? t("settings.integrations.testOk") : t("settings.integrations.testFailed"), ok ? "success" : "error");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Card
      title={t("settings.integrations.webhooksTitle")}
      description={t("settings.integrations.webhooksDescription")}
      action={
        <Button onClick={() => setEditing("new")}>
          <Plus size={15} /> {t("settings.integrations.newWebhook")}
        </Button>
      }
    >
      {!hooks ? null : hooks.length === 0 ? (
        <EmptyState icon={WebhookIcon} title={t("settings.integrations.noWebhooks")}>
          {t("settings.integrations.noWebhooksHint")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {hooks.map((h) => (
            <li key={h.id} className={`flex items-center gap-3 py-3 ${h.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium" title={h.url}>
                  {h.url}
                </div>
                <div className="truncate text-xs text-ink-ghost">
                  {h.events.length ? h.events.map((e) => labels[e]).join(", ") : t("settings.integrations.allEvents")}
                  {!h.isActive && ` · ${t("settings.integrations.paused")}`}
                  {h.lastDelivery && (
                    <span className={h.lastDelivery.ok ? "" : "text-danger"}>
                      {" · "}
                      {h.lastDelivery.ok ? t("settings.integrations.lastOk", { when: when(h.lastDelivery.createdAt) }) : t("settings.integrations.lastFailed", { when: when(h.lastDelivery.createdAt) })}
                    </span>
                  )}
                </div>
              </div>
              <IconButton aria-label={t("settings.integrations.testWebhook", { url: h.url })} onClick={() => test(h)}>
                <Send size={15} />
              </IconButton>
              <IconButton aria-label={t("settings.integrations.deliveriesOf", { url: h.url })} onClick={() => setLog(h)}>
                <History size={15} />
              </IconButton>
              <IconButton aria-label={t("settings.integrations.rotateSecretOf", { url: h.url })} onClick={() => setRotating(h)}>
                <KeyRound size={15} />
              </IconButton>
              <IconButton aria-label={t("settings.integrations.editWebhookOf", { url: h.url })} onClick={() => setEditing(h)}>
                <Pencil size={15} />
              </IconButton>
              <IconButton aria-label={t("settings.integrations.removeWebhookOf", { url: h.url })} onClick={() => setRemoving(h)}>
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-ink-faint">{t("settings.integrations.signatureNote")}</p>
      {editing && <WebhookDialog hook={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {log && <DeliveriesDialog hook={log} onClose={() => setLog(null)} />}
      {removing && (
        <ConfirmDialog
          title={t("settings.integrations.removeWebhookTitle")}
          body={removing.url}
          confirmLabel={t("common.remove")}
          onConfirm={async () => {
            await api.deleteWebhook(removing.id).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {rotating && (
        <ConfirmDialog
          title={t("settings.integrations.rotateTitle")}
          body={t("settings.integrations.rotateBody")}
          confirmLabel={t("settings.integrations.rotate")}
          onConfirm={async () => {
            try {
              setNewSecret((await api.rotateWebhookSecret(rotating.id)).secret);
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setRotating(null);
          }}
          onClose={() => setRotating(null)}
        />
      )}
      {newSecret && (
        <Dialog title={t("settings.integrations.newSecret")} description={t("settings.integrations.secretShownOnce")} onClose={() => setNewSecret(null)}>
          <SecretBox value={newSecret} />
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={() => setNewSecret(null)}>
              {t("common.done")}
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

export default function IntegrationsPage() {
  const can = useCan();
  return (
    <AppShell>
      <PageHeader title={t("common.settings")} meta={<SettingsTabs />} />
      <div className="w-full space-y-4 py-6">
        <TokensCard />
        {can("webhooks.manage") ? <WebhooksCard /> : <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">{t("settings.integrations.noWebhookRight")}</p>}
      </div>
    </AppShell>
  );
}
