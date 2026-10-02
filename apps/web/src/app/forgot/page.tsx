"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button, Field, Input } from "@/components/ui";

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
    <AuthCard title="Сброс пароля" subtitle="Пришлём ссылку для нового пароля" onSubmit={submit}>
      {sent ? (
        <p className="text-base">Если такая почта зарегистрирована, на неё ушло письмо со ссылкой. Она действует 1 час.</p>
      ) : (
        <>
          <Field label="Почта">
            {(a) => <Input {...a} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          {error && <p className="text-base text-danger">{error}</p>}
          <Button variant="primary" className="w-full py-2.5">Отправить ссылку</Button>
        </>
      )}
      <p className="text-center text-xs text-ink-faint">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </AuthCard>
  );
}
