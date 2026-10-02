"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { useSettings } from "@/lib/settings";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const settings = useSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await api.login(email, password);
      setToken(accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title="Вход" subtitle={settings?.workspaceName ?? "Канбан"} onSubmit={submit}>
      <Field label="Почта">
        {(a) => (
          <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        )}
      </Field>
      <Field label="Пароль">
        {(a) => (
          <Input {...a} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        )}
      </Field>
      {error && <p className="text-base text-danger">{error}</p>}
      <Button variant="primary" className="w-full py-2.5">Войти</Button>
      <p className="text-center text-xs text-ink-faint">
        Первый запуск?{" "}
        <Link href="/setup" className="font-medium text-accent hover:underline">
          Создать администратора
        </Link>
      </p>
    </AuthCard>
  );
}
