"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Minus, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { PERMISSIONS, type Permission, type RoleDto, type UserDto, t } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Button, Card, Checkbox, ConfirmDialog, Dialog, Field, Input, Menu, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

// Admin-only actions, listed so the matrix shows the full picture.
const ADMIN_ONLY = [t("settings.roles.addStaffChangeTheirRoles"), t("settings.roles.changeGeneralSettingsRolesAnd")];

const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

function RoleNameDialog({ role, onClose, onSaved }: { role?: RoleDto; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={role ? t("settings.roles.renameRole") : t("settings.roles.newRole")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError(t("common.enterAName2"));
          setBusy(true);
          try {
            if (role) await api.updateRole(role.id, { name: name.trim() });
            else await api.createRole({ name: name.trim() });
            toast(role ? t("settings.roles.roleRenamed") : t("settings.roles.roleCreatedTickItsPermissions"), "success");
            onSaved();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("common.name2")} hint={role ? undefined : t("settings.roles.forExampleProjectManagerOr")} error={error}>
          {(a) => <Input {...a} autoFocus maxLength={40} invalid={!!error} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy}>
            {role ? t("common.save") : t("settings.roles.createRole")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function RolesPage() {
  const [me, setMe] = useState<UserDto | null>(null);
  const [roles, setRoles] = useState<RoleDto[] | null>(null);
  // Unsaved permission changes, by role id.
  const [draft, setDraft] = useState<Record<string, Permission[]>>({});
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<RoleDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const load = useCallback(() => {
    api.roles().then(setRoles).catch(() => setRoles([]));
  }, []);
  useEffect(() => {
    load();
    api.me().then(setMe).catch(() => {});
  }, [load]);

  const canEdit = me?.role === "ADMIN";
  const permsOf = (r: RoleDto) => draft[r.id] ?? r.permissions;
  const changed = (roles ?? []).filter((r) => draft[r.id] && !sameSet(draft[r.id], r.permissions));

  const toggle = (r: RoleDto, p: Permission) => {
    const cur = permsOf(r);
    setDraft((d) => ({ ...d, [r.id]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] }));
  };

  async function save() {
    setBusy(true);
    try {
      await Promise.all(changed.map((r) => api.updateRole(r.id, { permissions: draft[r.id] })));
      setDraft({});
      load();
      toast(t("settings.roles.permissionsSaved"), "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const cols = `minmax(220px,1fr) 112px ${(roles ?? []).map(() => "112px").join(" ")}`;

  return (
    <AppShell>
      <PageHeader
        title={t("common.settings")}
        meta={<SettingsTabs />}
        actions={
          canEdit && (
            <>
              {changed.length > 0 && (
                <Button variant="ghost" onClick={() => setDraft({})}>
                  
                  {t("settings.roles.undo")}
                </Button>
              )}
              <Button onClick={() => setNaming("new")}>
                <Plus size={15} />  {t("settings.roles.newRole")}
              </Button>
              <Button variant="primary" loading={busy} disabled={!changed.length} onClick={save}>
                
                {t("common.save")}
              </Button>
            </>
          )
        }
      />
      <div className="w-full space-y-4 py-6">
        {me && !canEdit && (
          <p className="rounded-lg border border-border bg-surface-soft px-4 py-3 text-sm text-ink-faint">{t("settings.roles.rolesAndPermissionsAreManaged")}</p>
        )}
        <Card
          title={t("settings.roles.rolesAndPermissions")}
          description={t("settings.roles.anAdministratorCanDoEverything")}
          bodyClassName="p-4 pt-3"
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <div className="min-w-max">
              <div className="grid items-stretch border-b border-border bg-surface-soft text-xs font-medium text-ink-ghost" style={{ gridTemplateColumns: cols }}>
                <span className="flex items-end px-4 py-2">{t("settings.roles.action")}</span>
                <span className="flex flex-col items-center justify-end px-2 py-2 text-center">
                  <span className="text-ink">{t("common.administrator")}</span>
                  <span className="font-normal">{t("settings.roles.builtIn")}</span>
                </span>
                {roles?.map((r) => (
                  <span key={r.id} className="group/role relative flex flex-col items-center justify-end px-2 py-2 text-center">
                    <span className="flex max-w-full items-center gap-1 text-ink">
                      {r.isDefault && <Star size={11} className="shrink-0 fill-current text-ink-ghost" aria-label={t("settings.roles.defaultRole")} />}
                      <span className="truncate">{r.name}</span>
                    </span>
                    <span className="font-normal">
                      {r._count.users} {r._count.users % 10 === 1 && r._count.users % 100 !== 11 ? t("settings.roles.employee") : t("settings.roles.staff")}
                    </span>
                    {canEdit && (
                      <span className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/role:opacity-100">
                        <Menu
                          items={[
                            { label: t("settings.roles.rename"), icon: Pencil, onClick: () => setNaming(r) },
                            ...(!r.isDefault
                              ? [
                                  {
                                    label: t("settings.roles.makeDefaultRole"),
                                    icon: Star,
                                    onClick: () =>
                                      api
                                        .updateRole(r.id, { isDefault: true })
                                        .then(() => {
                                          toast(t("settings.roles.newStaffGet", { name: r.name }), "success");
                                          load();
                                        })
                                        .catch((e) => toast(e.message, "error")),
                                  },
                                  { label: t("settings.roles.deleteRole"), icon: Trash2, danger: true, onClick: () => setDeleting(r) },
                                ]
                              : []),
                          ]}
                        />
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {PERMISSIONS.map((p) => (
                <div key={p.key} className="grid items-center border-b border-border last:border-b-0" style={{ gridTemplateColumns: cols }}>
                  <span className="min-w-0 px-4 py-2.5">
                    <span className="block text-base">{p.label}</span>
                    {"hint" in p && <span className="block text-xs text-ink-faint">{p.hint}</span>}
                  </span>
                  <span className="grid place-items-center text-ink-faint">
                    <Check size={16} />
                  </span>
                  {roles?.map((r) => {
                    const on = permsOf(r).includes(p.key);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggle(r, p.key)}
                        aria-label={`${p.label} — ${r.name}`}
                        aria-pressed={on}
                        className="grid h-full min-h-11 place-items-center transition-colors enabled:hover:bg-surface-soft"
                      >
                        <Checkbox checked={on} onChange={() => {}} className="pointer-events-none" />
                      </button>
                    );
                  })}
                </div>
              ))}
              {ADMIN_ONLY.map((label) => (
                <div key={label} className="grid items-center border-t border-border" style={{ gridTemplateColumns: cols }}>
                  <span className="px-4 py-2.5 text-base text-ink-faint">{label}</span>
                  <span className="grid place-items-center text-ink-faint">
                    <Check size={16} />
                  </span>
                  {roles?.map((r) => (
                    <span key={r.id} className="grid place-items-center text-ink-ghost" title={t("settings.roles.administratorOnly")}>
                      <Minus size={16} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {roles?.length === 0 && <p className="mt-3 text-sm text-ink-faint">{t("settings.roles.noRolesYetEveryoneExcept")}</p>}
          <p className="mt-3 text-xs text-ink-ghost">
            <Star size={11} className="mr-1 inline fill-current align-[-1px]" />{t("settings.roles.theDefaultRoleNewStaff")}
          </p>
        </Card>
      </div>
      {naming && <RoleNameDialog role={naming === "new" ? undefined : naming} onClose={() => setNaming(null)} onSaved={load} />}
      {deleting && (
        <ConfirmDialog
          title={t("settings.roles.deleteRole2", { name: deleting.name })}
          body={
            deleting._count.users
              ? t("settings.roles.staffWillGetTheRole", { users: deleting._count.users, value: roles?.find((r) => r.isDefault)?.name ?? t("settings.roles.default") })
              : t("settings.roles.noStaffHaveThisRole")
          }
          confirmLabel={t("settings.roles.deleteRole")}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.deleteRole(deleting.id);
              toast(t("settings.roles.roleDeleted"), "success");
              load();
            } catch (e) {
              toast((e as Error).message, "error");
            }
            setDeleting(null);
          }}
        />
      )}
    </AppShell>
  );
}
