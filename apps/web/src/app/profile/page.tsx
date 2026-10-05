"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, currentLocale, type Locale, type UserDto } from "@plano/shared";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/avatar";
import { languageName, setUiLanguage } from "@/components/locale-gate";
import { Button, Card, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { imageToAvatarDataUrl } from "@/lib/image";
import { toast } from "@/lib/toast";
import { notifyMeChanged } from "@/lib/use-auth";
import { t } from "@plano/shared";
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
      toast(t("profile.photoUpdated"), "success");
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
      toast(t("profile.photoRemoved"), "success");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("profile.photo")} description={t("profile.shownOnCardsInDiscussions")}>
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
              {me.avatarUrl ? t("profile.replacePhoto") : t("profile.uploadPhoto")}
            </Button>
            {me.avatarUrl && (
              <Button variant="ghost" disabled={busy} onClick={remove}>
                
                {t("common.remove")}
              </Button>
            )}
          </div>
          <p className={`mt-1.5 text-xs ${error ? "text-danger" : "text-ink-ghost"}`}>
            {error ?? t("profile.jpgPngOrWebpYou")}
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
    if (!name.trim()) next.name = t("common.enterAName");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = t("profile.enterAnEmailLikeName");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      onSaved(await api.updateMe({ name: name.trim(), email: email.trim(), emailNotifications }));
      toast(t("profile.profileSaved"), "success");
    } catch (err) {
      setErrors({ email: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("common.general")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label={t("common.name")} error={errors.name}>
            {(a) => <Input {...a} invalid={!!errors.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          </Field>
          <Field label={t("common.signInEmail")} error={errors.email}>
            {(a) => (
              <Input {...a} type="email" invalid={!!errors.email} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            )}
          </Field>
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox checked={emailNotifications} onChange={setEmailNotifications} label={t("profile.duplicateNotificationsByEmail")} />
          <span>
            <span className="block text-base">{t("profile.duplicateNotificationsByEmail")}</span>
            <span className="block text-sm text-ink-faint">{t("profile.assignmentsMentionsMessagesAndDue")}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-ghost">{t("profile.roleAnAdministratorCanChange", { roleName: me.roleName })}</span>
          <Button variant="primary" loading={busy} disabled={!dirty}>
            
            {t("common.save")}
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
    if (!current) errs.current = t("profile.enterYourCurrentPassword");
    if (next.length < 8) errs.next = t("common.atLeast8Characters2");
    if (repeat !== next) errs.repeat = t("profile.passwordsDoNotMatch");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      toast(t("profile.passwordChanged"), "success");
    } catch (err) {
      setErrors({ current: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("common.password")} description={t("profile.afterTheChangeYouWill")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("profile.currentPassword")} error={errors.current}>
            {(a) => (
              <Input {...a} type="password" invalid={!!errors.current} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            )}
          </Field>
          <Field label={t("common.newPassword")} hint={t("common.atLeast8Characters2")} error={errors.next}>
            {(a) => <Input {...a} type="password" invalid={!!errors.next} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />}
          </Field>
          <Field label={t("profile.repeatTheNewOne")} error={errors.repeat}>
            {(a) => (
              <Input {...a} type="password" invalid={!!errors.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!current && !next && !repeat}>
            
            {t("profile.changePassword")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// The account's language: used by the interface and by emails sent to this person.
function LanguageSection({ me }: { me: UserDto }) {
  const [busy, setBusy] = useState(false);
  async function change(locale: Locale) {
    setBusy(true);
    try {
      await api.updateMe({ locale });
      setUiLanguage(locale);
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <Card title={t("profile.language")} description={t("profile.languageHint")}>
      <div className="max-w-xs">
        <Field label={t("profile.language")}>
          {(a) => (
            <Select {...a} disabled={busy} value={me.locale ?? currentLocale()} onChange={(e) => change(e.target.value as Locale)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Card>
  );
}

function OnboardingSection() {
  return (
    <Card title={t("common.gettingStarted")} description={t("profile.hintsOnTheHomePage")}>
      <Button
        variant="outline"
        onClick={async () => {
          await api.onboardingReopen().catch(() => {});
          toast(t("profile.hintsAreBackOnThe"), "success");
        }}
      >
        
        {t("profile.showGettingStarted")}
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
      <PageHeader title={t("common.profile")} />
      <div className="w-full space-y-4 py-6">
        {me ? (
          <>
            <PhotoSection me={me} onSaved={saved} />
            <DetailsSection key={`${me.name}|${me.email}`} me={me} onSaved={saved} />
            <PasswordSection />
            <LanguageSection me={me} />
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
