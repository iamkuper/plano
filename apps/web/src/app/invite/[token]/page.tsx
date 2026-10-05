"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";
import { t } from "@plano/shared";
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<{ email: string; workspaceName: string } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.invitationPreview(token).then(setInvite).catch((e) => setInvalid((e as Error).message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await api.acceptInvite(token, name, password);
      setToken(accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (invalid) {
    return (
      <AuthCard title={t("invite.token.invitationIsNotValid")} subtitle={invalid} onSubmit={(e) => e.preventDefault()}>
        <p className="text-base">{t("invite.token.askAnAdministratorToSend")}</p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          
          {t("invite.token.toSignIn")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={invite ? t("invite.token.join", { workspaceName: invite.workspaceName }) : t("invite.token.invitation")} subtitle={invite?.email ?? t("common.loading")} onSubmit={submit}>
      {invite && (
        <>
          <Field label={t("common.yourName")}>
            {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
          </Field>
          <Field label={t("common.password")}>
            {(a) => <Input {...a} type="password" placeholder={t("common.atLeast8Characters")} value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && <p className="text-base text-danger">{error}</p>}
          <Button variant="primary" className="w-full py-2.5">{t("invite.token.acceptInvitation")}</Button>
        </>
      )}
    </AuthCard>
  );
}
