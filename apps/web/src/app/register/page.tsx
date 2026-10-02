"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { goal } from "@/lib/analytics";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";

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
    <AuthCard title="Новое рабочее пространство" subtitle="Вы станете администратором, сотрудников добавите после входа" onSubmit={submit}>
      <Field label="Название компании">
        {(a) => (
          <Input {...a} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} autoFocus />
        )}
      </Field>
      <Field label="Ваше имя">
        {(a) => (
          <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Почта">
        {(a) => (
          <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
      </Field>
      <Field label="Пароль">
        {(a) => (
          <Input {...a}
          
            type="password"
            placeholder="от 8 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {error && <p className="text-base text-danger">{error}</p>}
      <Button variant="primary" className="w-full py-2.5">Создать</Button>
      <p className="text-center text-xs leading-relaxed text-ink-ghost">
        Нажимая «Создать», вы принимаете{" "}
        <Link href="/legal/terms" target="_blank" className="underline hover:text-ink">
          пользовательское соглашение
        </Link>{" "}
        и даёте{" "}
        <Link href="/legal/consent" target="_blank" className="underline hover:text-ink">
          согласие на обработку персональных данных
        </Link>
        .
      </p>
    </AuthCard>
  );
}
