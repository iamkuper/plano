"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";

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
      <AuthCard title="Приглашение недействительно" subtitle={invalid} onSubmit={(e) => e.preventDefault()}>
        <p className="text-base">Попросите администратора отправить новое приглашение.</p>
        <Link href="/login" className="text-sm font-medium text-accent hover:underline">
          Ко входу
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={invite ? `Присоединиться к «${invite.workspaceName}»` : "Приглашение"} subtitle={invite?.email ?? "Загрузка…"} onSubmit={submit}>
      {invite && (
        <>
          <Field label="Ваше имя">
            {(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
          </Field>
          <Field label="Пароль">
            {(a) => <Input {...a} type="password" placeholder="от 8 символов" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && <p className="text-base text-danger">{error}</p>}
          <Button variant="primary" className="h-10 w-full text-sm">Принять приглашение</Button>
        </>
      )}
    </AuthCard>
  );
}
