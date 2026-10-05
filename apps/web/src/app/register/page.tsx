"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      setToken(accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title={t("register.newWorkspace")} subtitle={t("register.youWillBecomeTheAdministrator")} onSubmit={submit}>
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
      <Button variant="primary" className="w-full py-2.5">{t("common.create")}</Button>
    </AuthCard>
  );
}
