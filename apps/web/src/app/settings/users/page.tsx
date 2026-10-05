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

// One select for both kinds of role: "ADMIN" (built in) or a custom role id.
const ADMIN = "ADMIN";
const roleValue = (u: Pick<UserDto, "role" | "roleId">) => (u.role === "ADMIN" ? ADMIN : (u.roleId ?? ""));
const MEMBER = "MEMBER";
const rolePatch = (value: string): { role: UserRole; roleId?: string } =>
  value === ADMIN ? { role: "ADMIN" } : value === MEMBER ? { role: "MEMBER" } : { role: "MEMBER", roleId: value };

function RoleOptions({ roles, withMember }: { roles: RoleDto[]; withMember?: boolean }) {
  return (
    <>
      {withMember && <option value={MEMBER}>Участник без дополнительных прав</option>}
      <option value={ADMIN}>Администратор</option>
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
      <Dialog title="Приглашение создано" description={result.emailSent ? `Письмо отправлено на ${result.email}` : "Письмо не отправлено: почта на сервере не настроена. Передайте ссылку сами"} onClose={onClose}>
        <div className="space-y-4">
          <Field label="Ссылка-приглашение" hint="Действует 7 дней, срабатывает один раз">
            {(a) => <Input {...a} readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              onClick={async () => {
                await navigator.clipboard?.writeText(result.link).catch(() => {});
                toast("Ссылка скопирована", "success");
              }}
            >
              <Copy size={15} /> Скопировать
            </Button>
            <Button variant="primary" onClick={onClose}>Готово</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title="Пригласить сотрудника" description="Человек получит ссылку, по которой сам задаст имя и пароль" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Почта" error={error}>
          {(a) => <Input {...a} type="email" invalid={!!error} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <Field label="Роль">
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value)}>
              <RoleOptions roles={roles} withMember />
            </Select>
          )}
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button variant="primary" loading={busy}>Пригласить</Button>
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
    <Dialog title="Новый сотрудник" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Имя">
          {(a) => (
            <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          )}
        </Field>
        <Field label="Почта для входа">
          {(a) => (
            <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
        </Field>
        <Field label="Временный пароль">
          {(a) => (
            <Input {...a}
            
              type="text"
              placeholder="от 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Field label="Роль">
          {(a) => (
            <Select {...a} value={role} onChange={(e) => setRole(e.target.value)}>
              <RoleOptions roles={roles} withMember />
            </Select>
          )}
        </Field>
        {error && <p className="text-base text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Отмена</Button>
          <Button variant="primary">Добавить</Button>
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
    <Dialog title="Новый пароль" description={`Для ${user.name}, ${user.email}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError("Не короче 8 символов");
          setBusy(true);
          try {
            await api.resetUserPassword(user.id, password);
            await navigator.clipboard?.writeText(password).catch(() => {});
            toast("Пароль изменён и скопирован — передайте его сотруднику", "success");
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Временный пароль" hint="Сотрудник сможет сменить его в разделе «Профиль»" error={error}>
          {(a) => <Input {...a} invalid={!!error} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" loading={busy}>
            Сохранить пароль
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
        title="Настройки"
        meta={<SettingsTabs />}
        actions={
          isAdmin && (
            <div className="flex gap-2">
              <Button onClick={() => setCreating(true)}>
                <Plus size={15} /> Новый сотрудник
              </Button>
              <Button variant="primary" onClick={() => setInviting(true)}>
                <Mail size={15} /> Пригласить
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
              <th className={th}>Сотрудник</th>
              <th className={th}>Роль</th>
              <th className={th}>Статус</th>
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
                        {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-ink-faint">(вы)</span>}
                      </div>
                      <div className="text-xs text-ink-faint">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className={td}>
                  {isAdmin && u.id !== me?.id ? (
                    <Select
                      aria-label={`Роль: ${u.name}`}
                      className="h-8 w-44"
                      value={roleValue(u)}
                      onChange={(e) => update(u.id, rolePatch(e.target.value))}
                    >
                      {!roleValue(u) && <option value="">Без роли</option>}
                      <RoleOptions roles={roles} />
                    </Select>
                  ) : (
                    u.roleName
                  )}
                </td>
                <td className={td}>
                  <Badge tone={u.isActive ? "success" : "default"}>{u.isActive ? "Активен" : "Отключён"}</Badge>
                </td>
                {isAdmin && (
                  <td className={`${td} text-right`}>
                    {u.id !== me?.id && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>
                          Сбросить пароль
                        </Button>
                        <Button size="sm" variant={u.isActive ? "ghost" : "outline"} onClick={() => update(u.id, { isActive: !u.isActive })}>
                          {u.isActive ? "Отключить" : "Включить"}
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
          <div className="border-b border-border px-4 py-2.5 text-sm font-medium">Приглашения</div>
          <table className="w-full border-collapse">
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} className={tr}>
                  <td className={td}>{i.email}</td>
                  <td className={`${td} text-ink-faint`}>
                    {i.role === "ADMIN" ? "Администратор" : (roles.find((r) => r.id === i.roleId)?.name ?? "Без роли")}
                  </td>
                  <td className={`${td} text-ink-faint`}>до {new Date(i.expiresAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</td>
                  <td className={`${td} text-right`}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await api.revokeInvitation(i.id).catch((e) => toast((e as Error).message, "error"));
                        load();
                      }}
                    >
                      Отозвать
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
