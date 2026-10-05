"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Mail, Plus } from "lucide-react";
import type { RoleDto, UserDto, UserRole } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { SettingsTabs } from "@/components/tab-links";
import { Avatar } from "@/components/avatar";
import { Badge, Button, Dialog, Field, PageHeader, Panel, td, th, tr, TableSkeleton, Input, Select } from "@/components/ui";
import { api, type InvitationDto } from "@/lib/api";
import { toast } from "@/lib/toast";
import { t, intlTag } from "@plano/shared";
// One select for both kinds of role: "ADMIN" (built in) or a custom role id.
const ADMIN = "ADMIN";
const roleValue = (u: Pick<UserDto, "role" | "roleId">) => (u.role === "ADMIN" ? ADMIN : (u.roleId ?? ""));
const MEMBER = "MEMBER";
const rolePatch = (value: string): { role: UserRole; roleId?: string } =>
  value === ADMIN ? { role: "ADMIN" } : value === MEMBER ? { role: "MEMBER" } : { role: "MEMBER", roleId: value };

function RoleOptions({ roles, withMember }: { roles: RoleDto[]; withMember?: boolean }) {
  return (
    <>
      {withMember && <option value={MEMBER}>{t("settings.users.aMemberWithoutExtraPermissions")}</option>}
      <option value={ADMIN}>{t("common.administrator")}</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </>
  );
}

function InviteDialog({ roles, onClose, onInvited }: { roles: RoleDto[]; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(() => roles.find((r) => r.isDefault)?.id ?? roles[0]?.id ?? MEMBER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; emailSent: boolean; email: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setResult(await api.invite({ email, ...rolePatch(role) }));
      onInvited();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Dialog title={t("settings.users.invitationCreated")} description={result.emailSent ? t("settings.users.anEmailWasSentTo", { email: result.email }) : t("settings.users.noEmailWasSentMail")} onClose={onClose}>
        <div className="space-y-4">
          <Field label={t("settings.users.invitationLink")} hint={t("settings.users.validFor7DaysWorks")}>
            {(a) => <Input {...a} readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              onClick={async () => {
                await navigator.clipboard?.writeText(result.link).catch(() => {});
                toast(t("common.linkCopied"), "success");
              }}
            >
              <Copy size={15} />  {t("settings.users.copy")}
            </Button>
            <Button variant="primary" onClick={onClose}>{t("common.done")}</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t("settings.users.inviteAColleague")} description={t("settings.users.theyWillGetALink")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("common.email")} error={error}>
          {(a) => <Input {...a} type="email" invalid={!!error} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Field label={t("settings.users.role")}>
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value)}>
              <RoleOptions roles={roles} withMember />
            </Select>
          )}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy}>{t("common.invite")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewUserDialog({ roles, onClose, onCreated }: { roles: RoleDto[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(() => roles.find((r) => r.isDefault)?.id ?? roles[0]?.id ?? MEMBER);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser({ name, email, password, ...rolePatch(role) });
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Dialog title={t("settings.users.newEmployee")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("common.name")}>
          {(a) => (
            <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          )}
        </Field>
        <Field label={t("common.signInEmail")}>
          {(a) => (
            <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label={t("settings.users.temporaryPassword")}>
          {(a) => (
            <Input {...a}
            
              type="text"
              placeholder={t("common.atLeast8Characters")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label={t("settings.users.role")}>
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value)}>
              <RoleOptions roles={roles} withMember />
            </Select>
          )}
        </Field>
        {error && <p className="text-base text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary">{t("common.add")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

// Admin sets a temporary password; the person changes it in their profile.
function ResetPasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const [password, setPassword] = useState(() => Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 90));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={t("common.newPassword")} description={t("settings.users.for", { name: user.name, email: user.email })} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError(t("common.atLeast8Characters2"));
          setBusy(true);
          try {
            await api.resetUserPassword(user.id, password);
            await navigator.clipboard?.writeText(password).catch(() => {});
            toast(t("settings.users.passwordChangedAndCopiedPass"), "success");
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("settings.users.temporaryPassword")} hint={t("settings.users.theyCanChangeItIn")} error={error}>
          {(a) => <Input {...a} invalid={!!error} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            
            {t("common.cancel")}
          </Button>
          <Button variant="primary" loading={busy}>
            
            {t("common.savePassword")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserDto[] | null>(null);
  const [me, setMe] = useState<UserDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("invite") === "1") setInviting(true);
  }, []);
  const [invitations, setInvitations] = useState<InvitationDto[]>([]);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleDto[]>([]);

  const load = useCallback(() => {
    api.users().then(setUsers).catch(() => {});
    api.roles().then(setRoles).catch(() => {});
    api.invitations().then(setInvitations).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    api.me().then(setMe).catch(() => {});
  }, [load]);

  const isAdmin = me?.role === "ADMIN";

  async function update(id: string, data: Partial<{ role: UserRole; roleId: string; isActive: boolean }>) {
    setError(null);
    try {
      await api.updateUser(id, data);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={t("common.settings")}
        meta={<SettingsTabs />}
        actions={
          isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}>
                <Plus size={15} />  {t("settings.users.newEmployee")}
              </Button>
              <Button variant="primary" onClick={() => setInviting(true)}>
                <Mail size={15} />  {t("common.invite")}
              </Button>
            </div>
          )
        }
      />
      <div className="h-5" />
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!users && <TableSkeleton />}
      {users && (
      <Panel className="mb-5 overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>{t("common.employee")}</th>
              <th className={th}>{t("settings.users.role")}</th>
              <th className={th}>{t("common.status")}</th>
              {isAdmin && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className={tr}>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <Avatar user={u} size={32} />
                    <div>
                      <div className="font-medium">
                        {u.name}
                        {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-ink-faint">{t("settings.users.you")}</span>}
                      </div>
                      <div className="text-xs text-ink-faint">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  {isAdmin && u.id !== me?.id ? (
                    <Select
                      aria-label={t("settings.users.role2", { name: u.name })}
                      className="h-8 w-44"
                      value={roleValue(u)}
                      onChange={(e) => update(u.id, rolePatch(e.target.value))}
                    >
                      {!roleValue(u) && <option value="">{t("common.noRole")}</option>}
                      <RoleOptions roles={roles} />
                    </Select>
                  ) : (
                    u.roleName
                  )}
                </td>
                <td className={td}>
                  <Badge tone={u.isActive ? "success" : "default"}>{u.isActive ? t("settings.users.active") : t("settings.users.deactivated")}</Badge>
                </td>
                {isAdmin && (
                  <td className={`${td} text-right`}>
                    {u.id !== me?.id && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                          
                          {t("settings.users.resetPassword")}
                        </Button>
                        <Button size="sm" variant={u.isActive ? "ghost" : "outline"} onClick={() => update(u.id, { isActive: !u.isActive })}>
                          {u.isActive ? t("common.turnOff") : t("common.resume")}
                        </Button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      )}
      {isAdmin && invitations.length > 0 && (
        <Panel className="mb-5 overflow-hidden">
          <div className="border-b border-border px-4 py-2.5 text-sm font-medium">{t("settings.users.invitations")}</div>
          <table className="w-full border-collapse">
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} className={tr}>
                  <td className={td}>{i.email}</td>
                  <td className={`${td} text-ink-faint`}>
                    {i.role === "ADMIN" ? t("common.administrator") : (roles.find((r) => r.id === i.roleId)?.name ?? t("common.noRole"))}
                  </td>
                  <td className={`${td} text-ink-faint`}>{t("settings.users.until", { newDate: new Date(i.expiresAt).toLocaleDateString(intlTag(), { day: "numeric", month: "long" }) })}</td>
                  <td className={`${td} text-right`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.revokeInvitation(i.id).catch((e) => toast((e as Error).message, "error"));
                        load();
                      }}
                    >
                      
                      {t("settings.users.revoke")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {inviting && <InviteDialog roles={roles} onClose={() => setInviting(false)} onInvited={load} />}
      {creating && <NewUserDialog roles={roles} onClose={() => setCreating(false)} onCreated={load} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </AppShell>
  );
}
