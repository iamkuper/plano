"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { goal } from "@/lib/analytics";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";
import { t } from "@plano/shared";
export default function RegisterPage() {
  const router = useRouter();
  const [workspaceName, setWorkspaceName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await api.register(workspaceName, name, email, password);
      goal("signup");
      setToken(accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title={t("register.createAWorkspace")} subtitle={t("register.14DaysOfProFree")} onSubmit={submit}>
      <Field label={t("register.companyName")}>
        {(a) => (
          <Input {...a} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} autoFocus />
        )}
      </Field>
      <Field label={t("common.yourName")}>
        {(a) => (
          <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label={t("common.email")}>
        {(a) => (
          <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      <Field label={t("common.password")}>
        {(a) => (
          <Input {...a}
          
            type="password"
            placeholder={t("common.atLeast8Characters")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {error && <p className="text-base text-danger">{error}</p>}
      <Button variant="primary" className="h-10 w-full text-sm">{t("common.create")}</Button>
      <p className="text-center text-xs leading-relaxed text-ink-ghost">
        
        {t("register.byClickingCreateYouAccept")}{" "}
        <Link href="/legal/terms" target="_blank" className="underline hover:text-ink">
          
          {t("register.termsOfService")}
        </Link>{" "}
        
        {t("register.andGive")}{" "}
        <Link href="/legal/consent" target="_blank" className="underline hover:text-ink">
          
          {t("register.consentToPersonalDataProcessing")}
        </Link>
        .
      </p>
      <p className="text-center text-xs text-ink-faint">
        
        {t("register.alreadyHaveAnAccount")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          
          {t("login.signIn2")}
        </Link>
      </p>
    </AuthCard>
  );
}
