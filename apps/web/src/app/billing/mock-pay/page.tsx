"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

// Stand-in for the bank's payment page while no T-Bank terminal is
// configured (the API reports testMode). Never reached with a real terminal.
function MockPay() {
  const router = useRouter();
  const order = useSearchParams().get("order") ?? "";
  const [error, setError] = useState<string | null>(null);

  async function pay(success: boolean) {
    setError(null);
    try {
      await api.mockPay(order, success);
      router.replace(`/settings/billing?paid=${success ? 1 : 0}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AuthCard title="Тестовая оплата" subtitle="Страница заменяет форму банка. Деньги не списываются" onSubmit={(e) => e.preventDefault()}>
      {error && <p className="text-base text-danger">{error}</p>}
      <Button variant="primary" className="w-full py-2.5" type="button" onClick={() => pay(true)}>Оплатить</Button>
      <Button className="w-full py-2.5" type="button" onClick={() => pay(false)}>Отклонить платёж</Button>
    </AuthCard>
  );
}

export default function MockPayPage() {
  return (
    <Suspense>
      <MockPay />
    </Suspense>
  );
}
