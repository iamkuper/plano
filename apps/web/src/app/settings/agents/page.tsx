"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, History, Pencil, Plus, Trash2 } from "lucide-react";
import { AGENT_PROVIDERS, intlTag, t, type AgentDto, type BillingDto, type AgentProvider, type AgentUsage, type AgentRunDto, type RoleDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { toast } from "@/lib/toast";

const compact = (n: number) => new Intl.NumberFormat(intlTag(), { notation: "compact", maximumFractionDigits: 1 }).format(n);
const spent = (u: AgentUsage) => (u.runs ? t("settings.agents.usageValue", { count: u.runs, tokens: compact(u.inputTokens + u.outputTokens) }) : t("settings.agents.usageNone"));

const providerName = (id: AgentProvider) => AGENT_PROVIDERS.find((p) => p.id === id)?.name ?? id;

function AgentDialog({ agent, roles, onClose, onSaved }: { agent?: AgentDto; roles: RoleDto[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: agent?.name ?? "",
    provider: (agent?.provider ?? "ANTHROPIC") as AgentProvider,
    model: agent?.model ?? AGENT_PROVIDERS[0].models[0],
    baseUrl: agent?.baseUrl ?? "",
    apiKey: "",
    instructions: agent?.instructions ?? "",
    roleId: agent?.roleId ?? roles.find((r) => r.isDefault)?.id ?? "",
    enabled: agent?.enabled ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<string | null>(null);
  const provider = AGENT_PROVIDERS.find((p) => p.id === form.provider)!;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTested(null);
  };

  function changeProvider(id: AgentProvider) {
    const next = AGENT_PROVIDERS.find((p) => p.id === id)!;
    setForm((f) => ({ ...f, provider: id, model: next.models.includes(f.model) ? f.model : (next.models[0] ?? "") }));
    setTested(null);
  }

  const payload = () => ({
    name: form.name.trim(),
    provider: form.provider,
    model: form.model.trim(),
    baseUrl: provider.needsBaseUrl ? form.baseUrl.trim() || null : null,
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    instructions: form.instructions,
    roleId: form.roleId || null,
    enabled: form.enabled,
  });

  async function check() {
    setError(null);
    setTesting(true);
    try {
      const p = payload();
      const res = await api.testAgent({ agentId: agent?.id, provider: p.provider, model: p.model, baseUrl: p.baseUrl, apiKey: p.apiKey });
      setTested(t("settings.agents.connectionWorks", { reply: res.reply }));
    } catch (e) {
      setTested(null);
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError(t("settings.agents.enterAName"));
    if (!form.model.trim()) return setError(t("settings.agents.enterAModel"));
    if (!agent && !form.apiKey.trim()) return setError(t("settings.agents.enterTheKey"));
    setError(null);
    setBusy(true);
    try {
      if (agent) await api.updateAgent(agent.id, payload());
      else await api.createAgent(payload());
      toast(agent ? t("settings.agents.agentSaved") : t("settings.agents.agentConnected"), "success");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={agent ? t("settings.agents.editAgent") : t("settings.agents.newAgent")} description={t("settings.agents.dialogHint")} onClose={onClose} width="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("common.name")}>{(a) => <Input {...a} autoFocus maxLength={40} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.agents.provider")}>
            {(a) => (
              <Select {...a} value={form.provider} onChange={(e) => changeProvider(e.target.value as AgentProvider)}>
                {AGENT_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("settings.agents.model")}>
            {(a) => (
              <>
                <Input {...a} list="agent-models" value={form.model} onChange={(e) => set("model", e.target.value)} />
                <datalist id="agent-models">
                  {provider.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        {provider.needsBaseUrl && (
          <Field label={t("settings.agents.apiAddress")} hint={t("settings.agents.apiAddressHint")}>
            {(a) => <Input {...a} placeholder="https://openrouter.ai/api/v1" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />}
          </Field>
        )}
        <Field label={t("settings.agents.apiKey")} hint={agent ? t("settings.agents.keyKept", { hint: agent.keyHint }) : t("settings.agents.keyHint")}>
          {(a) => <Input {...a} type="password" autoComplete="off" value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} />}
        </Field>
        <Field label={t("settings.agents.instructions")} hint={t("settings.agents.instructionsHint")}>
          {(a) => <Textarea {...a} rows={5} maxLength={4000} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />}
        </Field>
        <Field label={t("settings.agents.role")} hint={t("settings.agents.roleHint")}>
          {(a) => (
            <Select {...a} value={form.roleId} onChange={(e) => set("roleId", e.target.value)}>
              <option value="">{t("common.noRole")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-center gap-2 text-base">
          <Checkbox checked={form.enabled} onChange={(on) => set("enabled", on)} />
          {t("settings.agents.reacts")}
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        {tested && <p className="text-sm text-success">{tested}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" loading={testing} onClick={check}>
            {t("settings.agents.checkConnection")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy}>
              {agent ? t("common.save") : t("settings.agents.connect")}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString(intlTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TRIGGERS: Record<string, string> = {
  ASSIGNED: "settings.agents.triggerAssigned",
  MENTIONED: "settings.agents.triggerMentioned",
  COMMENTED: "settings.agents.triggerCommented",
};

function RunsDialog({ agent, onClose }: { agent: AgentDto; onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRunDto[] | null>(null);
  useEffect(() => {
    api.agentRuns(agent.id).then(setRuns).catch(() => setRuns([]));
  }, [agent.id]);
  return (
    <Dialog title={t("settings.agents.runsOf", { name: agent.name })} onClose={onClose} width="max-w-2xl">
      {!runs ? null : runs.length === 0 ? (
        <p className="text-sm text-ink-faint">{t("settings.agents.noRuns")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {runs.map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/projects/${r.card.projectId}?card=${r.card.id}`} className="min-w-0 truncate font-medium hover:text-accent">
                  {r.card.title}
                </Link>
                <span className="shrink-0 text-xs text-ink-ghost">{when(r.createdAt)}</span>
              </div>
              <div className="text-xs text-ink-faint">
                {t(TRIGGERS[r.trigger] ?? "settings.agents.triggerCommented")} · {t(`settings.agents.status${r.status}`)}
                {r.status !== "SKIPPED" && r.inputTokens + r.outputTokens > 0 && ` · ${t("settings.agents.tokens", { input: r.inputTokens, output: r.outputTokens })}`}
              </div>
              {r.error && <div className="mt-0.5 text-xs text-danger">{r.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export default function AgentsPage() {
  const can = useCan();
  const [agents, setAgents] = useState<AgentDto[] | null>(null);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [editing, setEditing] = useState<AgentDto | "new" | null>(null);
  const [history, setHistory] = useState<AgentDto | null>(null);
  const [removing, setRemoving] = useState<AgentDto | null>(null);
  const [billing, setBilling] = useState<BillingDto | null>(null);
  const available = billing?.plan.features.includes("agents") ?? true; // assume yes until the plan is known
  const manage = can("agents.manage");
  const allowed = manage && available; // connecting new agents

  const load = useCallback(() => {
    api.agents().then(setAgents).catch(() => setAgents([]));
  }, []);
  useEffect(() => {
    api.billing().then(setBilling).catch(() => {});
  }, []);
  useEffect(() => {
    if (!manage) {
      setAgents([]);
      return;
    }
    load();
    api.roles().then(setRoles).catch(() => {});
  }, [manage, load]);

  return (
    <AppShell>
      <PageHeader
        title={t("common.settings")}
        meta={<SettingsTabs />}
        actions={
          allowed && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus size={15} /> {t("settings.agents.newAgentButton")}
            </Button>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        {billing && !available && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm">
            <span>{t("settings.agents.businessOnly")}</span>
            <Link href="/settings/billing">
              <Button>{t("settings.agents.plans")}</Button>
            </Link>
          </div>
        )}
        {!manage && <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">{t("settings.agents.noRight")}</p>}
        <Card title={t("settings.agents.title")} description={t("settings.agents.description")}>
          {!agents ? null : agents.length === 0 ? (
            <EmptyState icon={Bot} title={t("settings.agents.empty")}>{t("settings.agents.emptyHint")}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {agents.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 py-3 ${a.isActive ? "" : "opacity-60"}`}>
                  <Avatar user={{ id: a.id, name: a.name, avatarUrl: a.avatarUrl, kind: "AGENT" }} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-base font-medium">
                      {a.name}
                      {!a.isActive && <span className="text-xs font-normal text-ink-ghost">{t("settings.agents.removed")}</span>}
                      {a.isActive && !a.enabled && <span className="text-xs font-normal text-ink-ghost">{t("settings.agents.off")}</span>}
                      {a.overSeat && <span className="text-xs font-normal text-danger">{t("settings.agents.noSeat")}</span>}
                    </div>
                    <div className="truncate text-xs text-ink-ghost" title={t("settings.agents.usageTitle", { input: a.usage.month.inputTokens, output: a.usage.month.outputTokens })}>
                      {t("settings.agents.usageLine", { today: spent(a.usage.today), month: spent(a.usage.month) })}
                    </div>
                    <div className="truncate text-sm text-ink-faint">
                      {providerName(a.provider)} · {a.model}
                      {a.lastRun && ` · ${t("settings.agents.lastRun", { when: when(a.lastRun.createdAt), status: t(`settings.agents.status${a.lastRun.status}`) })}`}
                    </div>
                  </div>
                  {manage && (
                    <>
                      <IconButton aria-label={t("settings.agents.runsOf", { name: a.name })} onClick={() => setHistory(a)}>
                        <History size={15} />
                      </IconButton>
                      <IconButton aria-label={t("settings.agents.editAgentNamed", { name: a.name })} onClick={() => setEditing(a)}>
                        <Pencil size={15} />
                      </IconButton>
                      {a.isActive && (
                        <IconButton aria-label={t("settings.agents.removeAgentNamed", { name: a.name })} onClick={() => setRemoving(a)}>
                          <Trash2 size={15} />
                        </IconButton>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {agents && agents.length > 0 && (
            <p className="mt-4 text-sm text-ink-faint">
              {t("settings.agents.usageTotal", {
                runs: agents.reduce((n, a) => n + a.usage.month.runs, 0),
                tokens: compact(agents.reduce((n, a) => n + a.usage.month.inputTokens + a.usage.month.outputTokens, 0)),
                input: compact(agents.reduce((n, a) => n + a.usage.month.inputTokens, 0)),
                output: compact(agents.reduce((n, a) => n + a.usage.month.outputTokens, 0)),
              })}
            </p>
          )}
          <p className="mt-2 text-sm text-ink-faint">{t("settings.agents.seatNote")}</p>
        </Card>
      </div>
      {editing && <AgentDialog agent={editing === "new" ? undefined : editing} roles={roles} onClose={() => setEditing(null)} onSaved={load} />}
      {history && <RunsDialog agent={history} onClose={() => setHistory(null)} />}
      {removing && (
        <ConfirmDialog
          title={t("settings.agents.removeAgentTitle", { name: removing.name })}
          body={t("settings.agents.removeAgentBody")}
          confirmLabel={t("common.remove")}
          onConfirm={async () => {
            await api.deleteAgent(removing.id).catch((e) => toast((e as Error).message, "error"));
            setRemoving(null);
            load();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </AppShell>
  );
}
