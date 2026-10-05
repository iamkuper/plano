"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";
import { t } from "@plano/shared";
export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title={t("forgot.passwordReset")} subtitle={t("forgot.weWillSendALink")} onSubmit={submit}>
      {sent ? (
        <p className="text-base">{t("forgot.ifThisEmailIsRegistered")}</p>
      ) : (
        <>
          <Field label={t("common.email")}>
            {(a) => <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          {error && <p className="text-base text-danger">{error}</p>}
          <Button variant="primary" className="w-full py-2.5">{t("forgot.sendLink")}</Button>
        </>
      )}
      <p className="text-center text-xs text-ink-faint">
        <Link href="/login" className="font-medium text-accent hover:underline">
          
          {t("forgot.backToSignIn")}
        </Link>
      </p>
    </AuthCard>
  );
}
