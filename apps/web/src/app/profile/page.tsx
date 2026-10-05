"use client";

import { useEffect, useRef, useState } from "react";
import type { UserDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { Button, Card, Checkbox, Field, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { imageToAvatarDataUrl } from "@/lib/image";
import { toast } from "@/lib/toast";
import { notifyMeChanged } from "@/lib/use-auth";

function PhotoSection({ me, onSaved }: { me: UserDto; onSaved: (u: UserDto) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await imageToAvatarDataUrl(file);
      onSaved(await api.setAvatar(dataUrl));
      toast("Фото обновлено", "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onSaved(await api.setAvatar(null));
      toast("Фото удалено", "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Фото" description="Видно на карточках, в обсуждениях и в списке сотрудников.">
      <div
        className="flex items-center gap-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
      >
        <Avatar user={me} size={64} />
        <div>
          <div className="flex gap-2">
            <Button variant="outline" loading={busy} onClick={() => fileRef.current?.click()}>
              {me.avatarUrl ? "Заменить фото" : "Загрузить фото"}
            </Button>
            {me.avatarUrl && (
              <Button variant="ghost" disabled={busy} onClick={remove}>
                Удалить
              </Button>
            )}
          </div>
          <p className={`mt-1.5 text-xs ${error ? "text-danger" : "text-ink-ghost"}`}>
            {error ?? "JPG, PNG или WebP. Можно перетащить файл сюда. Обрежем до квадрата."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </div>
    </Card>
  );
}

function DetailsSection({ me, onSaved }: { me: UserDto; onSaved: (u: UserDto) => void }) {
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email);
  const [emailNotifications, setEmailNotifications] = useState(me.emailNotifications ?? true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const dirty = name.trim() !== me.name || email.trim() !== me.email || emailNotifications !== (me.emailNotifications ?? true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Укажите имя";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Укажите почту в формате name@company.ru";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      onSaved(await api.updateMe({ name: name.trim(), email: email.trim(), emailNotifications }));
      toast("Профиль сохранён", "success");
    } catch (err) {
      setErrors({ email: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Основное">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Имя" error={errors.name}>
            {(a) => <Input {...a} invalid={!!errors.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          </Field>
          <Field label="Почта для входа" error={errors.email}>
            {(a) => (
              <Input {...a} type="email" invalid={!!errors.email} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            )}
          </Field>
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox checked={emailNotifications} onChange={setEmailNotifications} label="Дублировать уведомления на почту" />
          <span>
            <span className="block text-base">Дублировать уведомления на почту</span>
            <span className="block text-sm text-ink-faint">Назначения, упоминания, сообщения и напоминания о сроках</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-ghost">Роль: {me.roleName}. Роль меняет администратор.</span>
          <Button variant="primary" loading={busy} disabled={!dirty}>
            Сохранить
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!current) errs.current = "Введите текущий пароль";
    if (next.length < 8) errs.next = "Не короче 8 символов";
    if (repeat !== next) errs.repeat = "Пароли не совпадают";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      toast("Пароль изменён", "success");
    } catch (err) {
      setErrors({ current: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Пароль" description="После смены войти на других устройствах нужно будет заново с новым паролем.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Текущий пароль" error={errors.current}>
            {(a) => (
              <Input {...a} type="password" invalid={!!errors.current} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            )}
          </Field>
          <Field label="Новый пароль" hint="Не короче 8 символов" error={errors.next}>
            {(a) => <Input {...a} type="password" invalid={!!errors.next} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Field label="Повторите новый" error={errors.repeat}>
            {(a) => (
              <Input {...a} type="password" invalid={!!errors.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!current && !next && !repeat}>
            Изменить пароль
          </Button>
        </div>
      </form>
    </Card>
  );
}

function OnboardingSection() {
  return (
    <Card title="Начало работы" description="Подсказки на главной странице: шаги для первого запуска.">
      <Button
        variant="outline"
        onClick={async () => {
          await api.onboardingReopen().catch(() => {});
          toast("Подсказки вернулись на главную", "success");
        }}
      >
        Показать начало работы
      </Button>
    </Card>
  );
}

export default function ProfilePage() {
  const [me, setMe] = useState<UserDto | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
  }, []);

  function saved(user: UserDto) {
    setMe(user);
    notifyMeChanged(user);
  }

  return (
    <AppShell>
      <PageHeader title="Профиль" />
      <div className="w-full space-y-4 py-6">
        {me ? (
          <>
            <PhotoSection me={me} onSaved={saved} />
            <DetailsSection key={`${me.name}|${me.email}`} me={me} onSaved={saved} />
            <PasswordSection />
            <OnboardingSection />
          </>
        ) : (
          <div className="space-y-4" aria-busy="true">
            {[96, 140, 140].map((h, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-surface-soft" style={{ height: h }} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
