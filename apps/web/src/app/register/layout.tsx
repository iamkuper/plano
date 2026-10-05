import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Регистрация — 14 дней бесплатно",
  description: "Создайте пространство в Plano за минуту: 14 дней тарифа Pro бесплатно, без карты.",
  alternates: { canonical: "/register" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
