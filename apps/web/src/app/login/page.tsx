"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
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
    <AuthCard title="С возвращением" subtitle="Войдите в своё пространство Plano" onSubmit={submit}>
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
      <Button variant="primary" className="h-10 w-full text-sm">Войти</Button>
      <p className="text-center text-xs text-ink-faint">
        <Link href="/forgot" className="font-medium text-accent hover:underline">
          Забыли пароль?
        </Link>
      </p>
      <p className="text-center text-xs text-ink-faint">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Создать рабочее пространство
        </Link>
      </p>
    </AuthCard>
  );
}
