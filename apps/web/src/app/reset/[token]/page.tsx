"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";
import { toast } from "@/lib/toast";
import { t } from "@plano/shared";
export default function ResetPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.resetPassword(token, password);
      toast(t("reset.token.passwordChangedSignInWith"), "success");
      router.replace("/login");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title={t("common.newPassword")} subtitle={t("reset.token.chooseAPasswordForSigning")} onSubmit={submit}>
      <Field label={t("common.password")}>
        {(a) => <Input {...a} type="password" placeholder={t("common.atLeast8Characters")} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
      </Field>
      {error && (
        <p className="text-base text-danger">
          {error}{" "}
          <Link href="/forgot" className="font-medium underline">
            
            {t("reset.token.requestAgain")}
          </Link>
        </p>
      )}
      <Button variant="primary" className="w-full py-2.5">{t("common.savePassword")}</Button>
    </AuthCard>
  );
}
