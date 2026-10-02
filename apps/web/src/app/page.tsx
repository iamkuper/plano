"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Clock,
  FileText,
  KanbanSquare,
  LayoutTemplate,
  MessagesSquare,
  Repeat,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { PricingTable } from "@/components/marketing/pricing-table";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";
import { getToken } from "@/lib/api";
import { SUPPORT } from "@/lib/support";

const FEATURES = [
  { icon: KanbanSquare, title: "Доски, списки, таблица, календарь", text: "Одни и те же задачи в удобном виде. Перетаскивание, фильтры, поиск, массовые действия." },
  { icon: MessagesSquare, title: "Обсуждение прямо в карточке", text: "Сообщения как в мессенджере, @упоминания, файлы и скриншоты. Изменения видны всем сразу." },
  { icon: Clock, title: "Учёт времени", text: "Списание часов в карточке, бюджет проекта, отчёт по сотрудникам и проектам с выгрузкой в Excel." },
  { icon: CalendarRange, title: "Диаграмма Ганта", text: "Даты начала и окончания, зависимости между задачами, перенос мышью." },
  { icon: LayoutTemplate, title: "Шаблоны проектов", text: "Этапы и типовые задачи с подзадачами — новый проект готов за минуту." },
  { icon: Repeat, title: "Повторяющиеся задачи", text: "Ежедневные, еженедельные и ежемесячные задачи создаются сами." },
  { icon: ShieldCheck, title: "Роли и права", text: "Свои роли с набором прав: кто создаёт проекты, удаляет карточки, видит чужое время." },
  { icon: BarChart3, title: "Главный экран", text: "Мои задачи по срокам, время за неделю, нагрузка команды по этапам." },
];

const STEPS = [
  { title: "Создайте пространство", text: "Почта и пароль — без карты и звонков менеджера." },
  { title: "Добавьте проект", text: "С нуля или из шаблона: этапы и типовые задачи появятся сразу." },
  { title: "Пригласите команду", text: "Ссылкой или на почту. Роли и права настраиваются в пару кликов." },
];

const FAQ: [string, string][] = [
  ["Сколько длится пробный период?", "14 дней на тарифе Pro со всеми возможностями. Карта не нужна. После окончания можно оплатить тариф или перейти на бесплатный — данные сохранятся."],
  ["Можно оплатить по счёту?", "Да. Для юрлиц и ИП счёт формируется сразу в настройках тарифа: введите реквизиты, скачайте PDF. Тариф включится, когда оплата поступит."],
  ["Будут ли автоматические списания?", "Нет. Каждый период оплачивается отдельно, картой или по счёту. За три дня до окончания придёт напоминание."],
  ["Как считается цена?", "За каждое оплаченное место в месяц. Добавить сотрудника посреди периода можно — доплата только за оставшиеся дни."],
  ["Что будет, если не продлить?", "Через три дня после окончания пространство перейдёт в режим чтения: всё видно, но менять нельзя, пока тариф не оплачен."],
  ["Сколько места для файлов?", "Free — 1 ГБ на пространство, Pro — 10 ГБ, Business — 50 ГБ на каждого оплаченного пользователя."],
];

// Static board in the hero: shows the product without a screenshot.
function HeroBoard() {
  const cols = [
    { title: "Бэклог", color: "#8B8D94", cards: [["Бриф и требования", "Настройка", 18], ["План работ", "Настройка", 17]] },
    { title: "В работе", color: "#3D8BF2", cards: [["Интеграция с сайтом", "Интеграция", 14], ["Обучение команды", "Обучение", 15]] },
    { title: "На проверке", color: "#8A6CE8", cards: [["Отчёт за месяц", "Прочее", 12]] },
    { title: "Готово", color: "#2FA36B", cards: [["Доступы и роли", "Настройка", 9]] },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-soft p-3 shadow-raised" aria-hidden>
      <div className="grid min-w-[640px] grid-cols-4 gap-2">
        {cols.map((c) => (
          <div key={c.title} className="rounded-lg bg-surface-sunken/60">
            <div className="h-0.5 rounded-t-lg" style={{ background: c.color }} />
            <div className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium">
              {c.title} <span className="text-ink-ghost">{c.cards.length}</span>
            </div>
            <div className="space-y-1.5 px-1.5 pb-1.5">
              {c.cards.map(([t, type, n]) => (
                <div key={t} className="rounded-md border border-border bg-surface p-2.5 text-left">
                  <div className="text-[11px] text-ink-ghost">P-{n}</div>
                  <div className="mt-0.5 text-sm">{t}</div>
                  <div className="mt-1.5 text-[11px] text-ink-faint">{type}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  // Signed in: straight to the app.
  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
    else setReady(true);
  }, [router]);
  if (!ready) return <div className="min-h-screen bg-bg" />;

  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Задачи команды в одном спокойном месте</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-faint">
            Plano — канбан для небольших команд и агентств: проекты, сроки, обсуждения и учёт времени без лишней сложности.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
              Попробовать 14 дней бесплатно
            </Link>
            <Link href="/pricing" className="rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-soft">
              Тарифы
            </Link>
          </div>
          <p className="mt-3 text-sm text-ink-ghost">Без карты. Бесплатный тариф для команды до 3 человек.</p>
          <div className="mt-14 overflow-x-auto">
            <HeroBoard />
          </div>
        </section>

        <section id="features" className="border-t border-border bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Всё нужное для работы над проектами</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-ink-faint">И ничего лишнего: открыли — и понятно, что делать.</p>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-3 font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-ink-faint">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Начать — пять минут</h2>
              <p className="mt-3 text-ink-faint">Никаких внедрений и обучений: команда начинает работать в тот же день.</p>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border bg-surface p-5">
                  <span className="text-sm font-semibold text-accent">{i + 1}</span>
                  <h3 className="mt-2 font-medium">{s.title}</h3>
                  <p className="mt-1 text-sm text-ink-faint">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-border bg-surface py-16">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
            {[
              { icon: Zap, title: "Без автосписаний", text: "Платите за период, когда удобно. Напомним заранее." },
              { icon: FileText, title: "Оплата по счёту", text: "Счёт в PDF с вашими реквизитами формируется сразу." },
              { icon: MessagesSquare, title: "Живая поддержка", text: SUPPORT.url ? "Отвечаем в рабочее время, обычно в течение часа." : "Отвечаем на почту в рабочее время." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-ink-faint">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight">Тарифы</h2>
            <PricingTable />
          </div>
        </section>

        <section id="faq" className="border-t border-border bg-surface py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="mb-6 text-center text-3xl font-semibold tracking-tight">Частые вопросы</h2>
            <div className="divide-y divide-border rounded-xl border border-border">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-5 py-4">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {q}
                      <span className="text-ink-ghost transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-ink-faint">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Попробуйте с командой</h2>
          <p className="mt-3 text-ink-faint">14 дней всех возможностей Pro. Без карты.</p>
          <Link href="/register" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
            Создать пространство
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
