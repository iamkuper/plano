import Link from "next/link";
import { ArrowRight, Bot, Check, FileText, LayoutTemplate, Repeat, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { PricingTable } from "@/components/marketing/pricing-table";
import { ProductPreview } from "@/components/marketing/product-preview";
import { Reveal } from "@/components/marketing/reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/site";
import { SignedInRedirect } from "@/components/marketing/signed-in-redirect";
import { COMPANY } from "@/lib/company";
import type { Locale } from "@plano/shared";
import { appPath, makeTr, offerPrice, sitePath, type Tr } from "@/lib/marketing";
import { fetchPlans, jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import type { Metadata } from "next";

const useCases = (tr: Tr) => [
  tr("mk.shared.crmImplementation"),
  tr("mk.landing.websiteDevelopment"),
  tr("mk.landing.marketingAgency"),
  tr("mk.landing.designStudio"),
  tr("mk.landing.accountingServices"),
  tr("mk.shared.customerSupport"),
  tr("mk.landing.productTeam"),
  tr("mk.landing.eventAgency"),
  tr("mk.landing.legalPractice"),
  tr("mk.landing.renovationAndConstruction"),
];

const faq = (tr: Tr): [string, string][] => [
  [tr("mk.landing.howLongIsTheTrial"), tr("mk.landing.14DaysOnThePro")],
  [tr("mk.landing.canIPayByInvoice"), tr("mk.landing.yesCompaniesAndSoleTraders")],
  [tr("mk.landing.willYouChargeMeAutomatically"), tr("mk.landing.noEachPeriodIsPaid")],
  [tr("mk.landing.howIsThePriceCalculated"), tr("mk.landing.perPaidSeatPerMonth")],
  [tr("mk.landing.whatIfIDonT"), tr("mk.landing.threeDaysAfterThePeriod")],
  [tr("mk.landing.howMuchFileStorageIs"), tr("mk.landing.free1GbPerWorkspace")],
  [tr("mk.landing.agentsQuestion"), tr("mk.landing.agentsAnswer")],
];

// ---- Small animated illustrations for the feature grid ----

function ChatArt({ tr }: { tr: Tr }) {
  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#8A6CE8] text-[10px] font-semibold text-white">{tr("mk.landing.a")}</span>
        <div className="rounded-xl rounded-tl-sm bg-surface-soft px-3 py-2">
          <span className="font-medium text-[#3D8BF2]">{tr("mk.landing.ilya")}</span>  {tr("mk.landing.theMockupIsApprovedReady")}
        </div>
      </div>
      <div className="flex justify-end">
        <div className="rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-white">{tr("mk.landing.greatIMOnIt")}</div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-ink-ghost">
        <span className="grid size-4 place-items-center rounded-full bg-[#1E8F7A] text-[8px] font-semibold text-white">{tr("mk.landing.o")}</span>
        
        {tr("mk.landing.olegIsTyping")}
        <span className="lp-typing">
          <span>•</span>
          <span>•</span>
          <span>•</span>
        </span>
      </div>
    </div>
  );
}

function TimeArt({ tr }: { tr: Tr }) {
  const rows = [
    [tr("mk.landing.anna"), 82, "#8A6CE8"],
    [tr("mk.landing.ilya2"), 64, "#3D8BF2"],
    [tr("mk.landing.maria"), 45, "#E26AA0"],
  ] as const;
  return (
    <div className="space-y-2.5">
      {rows.map(([name, w, color], i) => (
        <div key={name} className="grid grid-cols-[52px_1fr_40px] items-center gap-2 text-[12px]">
          <span className="text-ink-faint">{name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <span className="lp-grow block h-full rounded-full" style={{ width: `${w}%`, background: color, animationDelay: `${300 + i * 120}ms` }} />
          </span>
          <span className="text-right text-ink-faint">{tr("mk.landing.h", { round: Math.round(w / 2.5) })}</span>
        </div>
      ))}
    </div>
  );
}

function GanttArt() {
  const bars = [
    [0, 35, "#8B8D94"],
    [25, 30, "#3D8BF2"],
    [48, 28, "#8A6CE8"],
    [70, 25, "#2FA36B"],
  ] as const;
  return (
    <div className="relative space-y-2">
      <div className="absolute inset-y-0 left-[56%] border-l-2 border-dashed border-danger/40" />
      {bars.map(([left, width, color], i) => (
        <div key={i} className="relative h-5">
          <span className="lp-grow absolute h-5 rounded-md" style={{ left: `${left}%`, width: `${width}%`, background: color, animationDelay: `${300 + i * 140}ms` }} />
        </div>
      ))}
    </div>
  );
}

function RolesArt({ tr }: { tr: Tr }) {
  return (
    <div className="space-y-1.5 text-[12px]">
      {(
        [
          [tr("shared.createProjects"), true, true],
          [tr("shared.deleteCards"), true, false],
          [tr("mk.landing.seeOthersTime"), true, true],
        ] as const
      ).map(([label, a, b]) => (
        <div key={label} className="grid grid-cols-[1fr_28px_28px] items-center gap-1 rounded-md bg-surface-soft px-2.5 py-1.5">
          <span>{label}</span>
          {[a, b].map((on, i) => (
            <span key={i} className={`mx-auto grid size-4 place-items-center rounded-sm ${on ? "bg-accent text-white" : "border border-border-strong"}`}>
              {on ? <Check size={11} strokeWidth={3} /> : null}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// An agent answering in a card: a message, a reply, and the cost of the run.
function AgentsArt({ tr }: { tr: Tr }) {
  return (
    <div className="space-y-2 text-[12px]">
      <div className="flex justify-end">
        <div className="rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-white">
          <span className="font-medium text-[#BBD6FA]">@{tr("mk.landing.agentName")}</span> {tr("mk.landing.agentCall")}
        </div>
      </div>
      <div className="flex gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#8A6CE8]/15 text-[#8A6CE8]">
          <Bot size={14} />
        </span>
        <div className="rounded-xl rounded-tl-sm bg-surface-soft px-3 py-2">{tr("mk.landing.agentAnswer")}</div>
      </div>
      <div className="pl-8 text-[11px] text-ink-ghost">{tr("mk.landing.agentTokens")}</div>
    </div>
  );
}

function Bento({ title, text, children, className = "", delay = 0 }: { title: string; text: string; children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={`flex flex-col rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-raised ${className}`}>
      <div className="mb-6 flex-1">{children}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-faint">{text}</p>
    </Reveal>
  );
}

const smallFeatures = (tr: Tr) => [
  { icon: LayoutTemplate, title: tr("mk.landing.projectTemplates"), text: tr("mk.landing.stagesAndTypicalTasks") },
  { icon: Repeat, title: tr("common.recurringTasks"), text: tr("mk.landing.createdAutomatically") },
  { icon: ShieldCheck, title: tr("mk.landing.readOnlyMode"), text: tr("mk.landing.yourDataIsNeverLost") },
];

const promises = (tr: Tr) => [
  { icon: Zap, title: tr("mk.landing.noAutoCharges"), text: tr("mk.landing.payForAPeriodWhen") },
  { icon: FileText, title: tr("settings.billing.payByInvoice"), text: tr("mk.landing.aPdfInvoiceWithYour") },
  { icon: Check, title: tr("mk.landing.aFairPrice"), text: tr("mk.landing.onlyForPeopleWhoWork") },
];

export function landingMetadata(locale: Locale): Metadata {
  const tr = makeTr(locale);
  const title = tr("mk.landing.planoKanbanAndTaskTracker");
  const description = tr("mk.seo.planoKanbanAndTaskTracker");
  const url = `${SITE_URL}${sitePath(locale)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: sitePath(locale), languages: { ru: "/", en: "/en", "x-default": "/" } },
    openGraph: { type: "website", locale: locale === "en" ? "en_US" : "ru_RU", url, siteName: SITE_NAME, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

// The public landing page. `locale` is fixed by the address (/ or /en).
export async function Landing({ locale }: { locale: Locale }) {
  const tr = makeTr(locale);
  const FAQ = faq(tr);
  const pricing = await fetchPlans();
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/plano.svg`,
      email: COMPANY.email,
      legalName: COMPANY.name,
      taxID: COMPANY.inn,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: locale,
      description: tr("mk.seo.planoKanbanAndTaskTracker"),
      offers: (pricing?.plans ?? []).map((p) => ({
        "@type": "Offer",
        name: p.name,
        ...offerPrice(locale, p),
        description: p.priceKopecks ? tr("mk.landing.perUserPerMonth") : tr("mk.landing.free"),
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  return (
    <div lang={locale} className="min-h-screen overflow-x-hidden bg-bg">
      <SignedInRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <SiteHeader locale={locale} />
      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="lp-drift absolute -left-40 -top-40 size-[520px] rounded-full bg-[#3D8BF2]/15 blur-3xl" />
            <div className="lp-drift absolute -right-32 top-10 size-[460px] rounded-full bg-[#8A6CE8]/15 blur-3xl" style={{ animationDelay: "-6s" }} />
            <div className="lp-drift absolute left-1/3 top-72 size-[380px] rounded-full bg-[#2FA36B]/10 blur-3xl" style={{ animationDelay: "-12s" }} />
            <div className="absolute inset-0 bg-[radial-gradient(#1B1C1F14_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
            <div className="lp-rise inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs text-ink-faint backdrop-blur">
              <Sparkles size={13} className="text-[#8A6CE8]" />  {tr("mk.landing.kanbanForSmallTeamsAnd")}
            </div>
            <h1 className="lp-rise mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl" style={{ animationDelay: "80ms" }}>
              
              {tr("authCard.yourTeamSTasks")}{" "}
              <span className="bg-gradient-to-r from-[#3D8BF2] via-[#8A6CE8] to-[#E26AA0] bg-clip-text text-transparent">{tr("authCard.inOneCalmPlace")}</span>
            </h1>
            <p className="lp-rise mx-auto mt-5 max-w-2xl text-lg text-ink-faint" style={{ animationDelay: "160ms" }}>
              
              {tr("mk.landing.projectsDeadlinesDiscussionsAndTime")}
            </p>
            <div className="lp-rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link
                href={appPath(locale, "/register")}
                className="group inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 hover:bg-accent-hover"
              >
                
                {tr("mk.landing.tryFreeFor14Days")} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href={sitePath(locale, "/pricing")} className="rounded-lg border border-border bg-surface px-5 py-3 text-sm font-medium transition-colors hover:bg-surface-soft">
                
                {tr("mk.shared.pricing")}
              </Link>
            </div>
            <p className="lp-rise mt-3 text-sm text-ink-ghost" style={{ animationDelay: "300ms" }}>
              
              {tr("mk.landing.noCardFreeForTeams")}
            </p>
            <div className="lp-rise relative mx-auto mt-14 max-w-5xl" style={{ animationDelay: "380ms" }}>
              <ProductPreview locale={locale} />
            </div>
          </div>
        </section>

        {/* Use cases marquee */}
        <section aria-label={tr("mk.landing.whoItIsFor")} className="border-y border-border bg-surface py-5">
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
            <div className="lp-marquee flex w-max gap-3">
              {[...useCases(tr), ...useCases(tr)].map((u, i) => (
                <span key={i} className="whitespace-nowrap rounded-full border border-border px-4 py-1.5 text-sm text-ink-faint">
                  {u}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tr("mk.landing.everythingForProjectWork")}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-ink-faint">{tr("mk.landing.theSameTasksOnA")}</p>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-6">
              <Bento className="md:col-span-3" title={tr("mk.landing.discussionRightInTheCard")} text={tr("mk.landing.messengerStyleMessagesMentionsFiles")}>
                <ChatArt tr={tr} />
              </Bento>
              <Bento className="md:col-span-3" delay={80} title={tr("mk.landing.timeTrackingAndBudget")} text={tr("mk.landing.hoursAreLoggedOnThe")}>
                <TimeArt tr={tr} />
              </Bento>
              <Bento className="md:col-span-2" title={tr("settings.billing.ganttChart")} text={tr("mk.landing.datesDependenciesAndDragTo")}>
                <GanttArt />
              </Bento>
              <Bento className="md:col-span-2" delay={80} title={tr("settings.roles.rolesAndPermissions")} text={tr("mk.landing.yourOwnRolesWhoCan")}>
                <RolesArt tr={tr} />
              </Bento>
              <Reveal delay={160} className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-6 md:col-span-2">
                {smallFeatures(tr).map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <Icon size={16} />
                    </span>
                    <div>
                      <div className="text-sm font-medium">{title}</div>
                      <div className="text-xs text-ink-faint">{text}</div>
                    </div>
                  </div>
                ))}
              </Reveal>
              <Reveal delay={240} className="grid gap-6 rounded-2xl border border-border bg-surface p-6 md:col-span-6 md:grid-cols-[1.1fr_1fr] md:items-center">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8A6CE8]/10 px-2.5 py-1 text-xs font-medium text-[#6B4FD1]">
                    <Bot size={13} /> {tr("mk.landing.agentsBadge")}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold">{tr("mk.landing.agentsTitle")}</h3>
                  <p className="mt-1.5 text-sm text-ink-faint">{tr("mk.landing.agentsText")}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {(["mk.landing.agentsPoint1", "mk.landing.agentsPoint2", "mk.landing.agentsPoint3"] as const).map((k) => (
                      <li key={k} className="flex gap-2">
                        <Check size={16} className="mt-0.5 shrink-0 text-success" /> {tr(k)}
                      </li>
                    ))}
                  </ul>
                </div>
                <AgentsArt tr={tr} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tr("mk.landing.startInFiveMinutes")}</h2>
              <p className="mt-3 text-ink-faint">{tr("mk.landing.noRolloutNoTrainingYour")}</p>
            </Reveal>
            <ol className="relative mt-12 grid gap-4 sm:grid-cols-3">
              <div aria-hidden className="absolute left-[16%] right-[16%] top-12 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent sm:block" />
              {[
                [tr("register.createAWorkspace"), tr("mk.landing.emailAndPasswordNoCard")],
                [tr("mk.landing.addAProject"), tr("mk.landing.fromScratchOrFromA")],
                [tr("mk.landing.inviteYourTeam"), tr("mk.landing.byLinkOrEmailRoles")],
              ].map(([t, d], i) => (
                <Reveal as="li" key={t} delay={i * 120} className="relative rounded-2xl border border-border bg-bg p-6 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-lg font-semibold text-white shadow-lg shadow-black/10">{i + 1}</span>
                  <h3 className="mt-4 font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-ink-faint">{d}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Billing promises */}
        <section className="py-16">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
            {promises(tr).map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 90} className="flex gap-3 rounded-2xl border border-border bg-surface p-5">
                <Icon size={20} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-ink-faint">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tr("mk.shared.pricing")}</h2>
              <p className="mt-3 text-ink-faint">{tr("mk.landing.aYearCostsTenMonths")}</p>
            </Reveal>
            <Reveal>
              <PricingTable initial={pricing} locale={locale} />
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Reveal>
              <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight sm:text-4xl">{tr("mk.landing.frequentlyAskedQuestions")}</h2>
            </Reveal>
            <Reveal className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {q}
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-ink-faint transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-faint">{a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#2B2F33] px-6 py-16 text-center text-white">
            <div aria-hidden className="lp-drift absolute -left-20 -top-24 size-80 rounded-full bg-[#3D8BF2]/30 blur-3xl" />
            <div aria-hidden className="lp-drift absolute -bottom-24 -right-16 size-80 rounded-full bg-[#8A6CE8]/30 blur-3xl" style={{ animationDelay: "-8s" }} />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tr("mk.landing.tryItWithYourTeam")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-[#CDD0D4]">{tr("mk.landing.14DaysOfEverythingIn")}</p>
              <Link href={appPath(locale, "/register")} className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-medium text-[#1B1C1F] transition-transform hover:-translate-y-0.5">
                
                {tr("mk.landing.createAWorkspace")} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
