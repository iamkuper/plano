import Link from "next/link";
import { Check } from "lucide-react";
import { LanguageSwitch, LocaleGate } from "./locale-gate";
import { SupportWidget } from "./marketing/support-widget";
import { t } from "@plano/shared";
const POINTS = [t("authCard.14DaysOfProFree"), t("authCard.boardsListCalendarAndGantt"), t("authCard.discussionsFilesAndTimeTracking"), t("authCard.payByCardOrInvoice")];

// A few cards floating on the dark panel: the product at a glance.
function MiniBoard() {
  const cols = [
    { title: t("settings.templates.id.inProgress"), color: "#3D8BF2", cards: [t("authCard.websiteIntegration"), t("authCard.teamTraining")] },
    { title: t("common.done"), color: "#2FA36B", cards: [t("authCard.briefAndRequirements")] },
  ];
  return (
    <div className="lp-float grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2.5 backdrop-blur" aria-hidden>
      {cols.map((c, ci) => (
        <div key={c.title} className="rounded-xl bg-white/5">
          <div className="h-[3px] rounded-t-xl" style={{ background: c.color }} />
          <div className="px-2.5 py-2 text-[11px] font-medium text-white/80">{c.title}</div>
          <div className="space-y-1.5 px-1.5 pb-1.5">
            {c.cards.map((t, i) => (
              <div key={t} className="lp-rise rounded-lg bg-white p-2 text-[12px] text-[#1B1C1F] shadow-sm" style={{ animationDelay: `${300 + (ci * 2 + i) * 150}ms` }}>
                <div className="text-[10px] text-[#9A9CA3]">P-{21 + ci * 2 + i}</div>
                {t}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Sign-in, sign-up, password reset and invitations share this layout:
// the form on the left, a dark brand panel on the right (wide screens).
export function AuthCard({
  title,
  subtitle,
  onSubmit,
  children,
}: {
  title: string;
  subtitle: string;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <LocaleGate>
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1fr_1.05fr]">
      <SupportWidget />
      <div className="relative flex flex-col overflow-hidden px-4 py-6 sm:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div className="lp-drift absolute -left-32 -top-32 size-[380px] rounded-full bg-[#3D8BF2]/15 blur-3xl" />
          <div className="lp-drift absolute -bottom-32 -right-24 size-[340px] rounded-full bg-[#8A6CE8]/15 blur-3xl" style={{ animationDelay: "-8s" }} />
        </div>
        <Link href="/" className="relative flex items-center gap-2 self-start text-base font-semibold">
          <img src="/plano.svg" alt="" className="size-7 rounded-lg" /> Plano
        </Link>
        <div className="relative flex flex-1 items-center justify-center py-10">
          <form onSubmit={onSubmit} className="lp-rise w-full max-w-[380px] space-y-4">
            <div className="mb-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-1.5 text-sm text-ink-faint">{subtitle}</p>
            </div>
            {children}
          </form>
        </div>
        <div className="relative flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-ghost">
          <span>© {new Date().getFullYear()} Plano</span>
          <Link href="/legal/terms" className="hover:text-ink">
            
            {t("authCard.terms")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            
            {t("authCard.personalData")}
          </Link>
          <Link href="/pricing" className="hover:text-ink">
            
            {t("settings.fields.plans")}
          </Link>
          <span className="ml-auto">
            <LanguageSwitch />
          </span>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-[#2B2F33] text-white lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div aria-hidden className="lp-drift absolute -left-24 -top-24 size-96 rounded-full bg-[#3D8BF2]/30 blur-3xl" />
        <div aria-hidden className="lp-drift absolute -bottom-32 -right-20 size-96 rounded-full bg-[#8A6CE8]/30 blur-3xl" style={{ animationDelay: "-8s" }} />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(#ffffff12_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            
            {t("authCard.yourTeamSTasks")}{" "}
            <span className="bg-gradient-to-r from-[#7DB3F7] via-[#B4A2F2] to-[#F0A3C6] bg-clip-text text-transparent">{t("authCard.inOneCalmPlace")}</span>
          </h2>
          <ul className="mt-6 space-y-2.5 text-[15px] text-[#CDD0D4]">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/10">
                  <Check size={12} strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <MiniBoard />
          </div>
        </div>
      </aside>
    </div>
    </LocaleGate>
  );
}
