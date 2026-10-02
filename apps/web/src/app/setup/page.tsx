"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { useSettings } from "@/lib/settings";
import { Button, Field, Input } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const settings = useSettings();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { accessToken } = await api.setup(name, email, password);
      setToken(accessToken);
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AuthCard title="Первый администратор" subtitle={`${settings?.workspaceName ?? "Канбан"}: остальных сотрудников добавите после входа`} onSubmit={submit}>
      <Field label="Имя">
        {(a) => (
          <Input {...a} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
    </AuthCard>
  );
}
