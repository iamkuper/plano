"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  House,
  LifeBuoy,
  FolderKanban,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { BillingDto, ProjectListItemDto, UserDto } from "@plano/shared";
import { BILLING_CHANGED, api, setToken } from "@/lib/api";
import { useCan } from "@/lib/permissions";
import { onProjectsChanged } from "@/lib/projects-events";
import { useSettings } from "@/lib/settings";
import { SUPPORT } from "@/lib/support";
import { useAuth } from "@/lib/use-auth";
import { Avatar, LetterMark } from "./avatar";
import { CommandPalette } from "./command-palette";
import { HeaderSearch } from "./header-search";
import { openPalette } from "@/lib/palette";
import { NotificationBell } from "./notification-bell";
import { LocaleGate } from "./locale-gate";
import { Toaster } from "./toaster";
import { Popover, Tooltip } from "./ui";
import { t, intlTag } from "@plano/shared";
const COLLAPSED_KEY = "plano.sidebar-collapsed";

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
  urgent,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
  urgent?: boolean;
  collapsed?: boolean;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={`relative flex h-[30px] items-center gap-2.5 rounded-md text-sm transition-colors ${collapsed ? "w-[30px] justify-center" : "px-2"} ${
        active
          ? "bg-chrome-active font-medium text-chrome-ink"
          : "text-chrome-ink-soft hover:bg-chrome-hover hover:text-chrome-ink"
      }`}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={active ? "text-chrome-ink" : "text-chrome-ink-faint"}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {count ? (
        collapsed ? (
          <span
            aria-hidden
            className={`absolute right-0.5 top-0.5 size-1.5 rounded-full ${urgent ? "bg-red-400" : "bg-chrome-ink-faint"}`}
          />
        ) : (
          <span
            className={`text-xs ${urgent ? "font-semibold text-red-300" : "text-chrome-ink-faint"}`}
          >
            {count}
          </span>
        )
      ) : null}
    </Link>
  );
  return collapsed ? (
    <Tooltip label={count ? `${label}: ${count}` : label}>{link}</Tooltip>
  ) : (
    link
  );
}

// My open cards due today or overdue → count on "Мои задачи".
function useUrgentCount(user: UserDto | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    api
      .urgentCount(endOfToday)
      .then((r) => setCount(r.count))
      .catch(() => {});
  }, [user]);
  return count;
}

function useActiveProjects() {
  const [projects, setProjects] = useState<ProjectListItemDto[]>([]);
  const load = useCallback(() => {
    api
      .projects("ACTIVE")
      .then(setProjects)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    return onProjectsChanged(load);
  }, [load]);
  return projects;
}

// useSearchParams needs a Suspense boundary for static rendering.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleGate>
      <Suspense>
        <Shell>{children}</Shell>
      </Suspense>
    </LocaleGate>
  );
}

const DAY_MS = 86_400_000;
// Paid periods lock this long after their end (GRACE_AFTER_PERIOD_MS on the API).
const GRACE_MS = 3 * DAY_MS;
const REMIND_DAYS = 3;
const longDate = (d: Date) => d.toLocaleDateString(intlTag(), { day: "numeric", month: "long" });

// What the billing banner says, or null. No auto-renewal, so it warns
// REMIND_DAYS before the trial or paid period ends, during the grace after
// it, and once the workspace is read-only.
function billingNotice(b: BillingDto, now = Date.now()): { tone: "danger" | "warning"; text: string; action: string } | null {
  const s = b.subscription;
  if (b.locked) return { tone: "danger", text: t("appShell.thePlanHasEndedData2"), action: t("appShell.payForThePlan") };
  if (s.planId === "FREE") return null;
  const trial = s.status === "TRIALING";
  const endIso = trial ? s.trialEndsAt : s.currentPeriodEnd;
  if (!endIso) return null;
  const end = new Date(endIso);
  const left = end.getTime() - now;
  if (left > REMIND_DAYS * DAY_MS) return null;
  if (left <= 0) {
    return {
      tone: "danger",
      text: t("appShell.thePaidPeriodEndedOn", { longDate: longDate(end), longDate2: longDate(new Date(end.getTime() + GRACE_MS)) }),
      action: t("appShell.renewPlan"),
    };
  }
  const days = Math.max(1, Math.ceil(left / DAY_MS));
  return {
    tone: "warning",
    text: t("appShell.endsOnThereAreNo", { value: trial ? t("appShell.trial") : t("appShell.paidPeriod"), longDate: longDate(end), left: t("appShell.daysLeft", { count: days }) }),
    action: trial ? t("settings.billing.chooseAPlan") : t("appShell.renewPlan"),
  };
}

// Shown on every page: the period is about to end, has ended, or the
// workspace is read-only until the plan is paid.
function BillingBanner() {
  const can = useCan();
  const pathname = usePathname();
  const [billing, setBilling] = useState<BillingDto | null>(null);
  useEffect(() => {
    const check = () => api.billing().then(setBilling).catch(() => {});
    check();
    window.addEventListener("focus", check);
    window.addEventListener(BILLING_CHANGED, check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener(BILLING_CHANGED, check);
    };
  }, [pathname]);
  const notice = billing && billingNotice(billing);
  if (!notice) return null;
  const manager = can("billing.manage");
  return (
    <div
      role={notice.tone === "danger" ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-2.5 text-sm ${
        notice.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-ink"
      }`}
    >
      <span>
        {notice.text}
        {manager
          ? billing.locked
            ? t("appShell.payForThePlanAnd")
            : t("appShell.payByCardSoWork")
          : t("appShell.askAnAdministratorToPay")}
      </span>
      {manager && pathname !== "/settings/billing" && (
        <Link href="/settings/billing" className="font-medium underline">
          {notice.action}
        </Link>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const user = useAuth();
  const settings = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const urgent = useUrgentCount(user);
  const projects = useActiveProjects();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  // "[" toggles the sidebar (as in Linear), unless typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        t.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)
      )
        return;
      e.preventDefault();
      toggleCollapsed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  // Wait for settings too: card keys use the workspace prefix.
  if (!user || !settings)
    return <div className="h-screen bg-chrome" aria-busy="true" />;
  const workspace = settings.workspaceName;

  return (
    <div className="flex h-screen bg-chrome">
      <CommandPalette />
      <aside
        className={`flex shrink-0 flex-col pb-2 transition-[width] duration-150 ${collapsed ? "w-[52px] items-center px-1.5" : "w-[232px] px-2"}`}
      >
        {/* Workspace + user menu */}
        <div
          className={`flex h-12 items-center ${collapsed ? "justify-center" : "px-1"}`}
        >
          <Link
            href="/projects"
            aria-label={workspace}
            className="flex h-8 min-w-0 items-center gap-2 rounded-md px-1.5 text-chrome-ink transition-colors hover:bg-chrome-hover"
          >
            <img
              src="/plano.svg"
              alt="Plano"
              className="size-5 shrink-0 rounded-[5px]"
            />
            {!collapsed && (
              <span className="truncate text-sm font-medium">{workspace}</span>
            )}
          </Link>
          {!collapsed && (
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
              <button
                onClick={toggleCollapsed}
                title={t("appShell.collapseMenu")}
                aria-label={t("appShell.collapseMenu2")}
                className="grid size-7 place-items-center rounded-md text-chrome-ink-faint transition-colors hover:bg-chrome-hover hover:text-chrome-ink"
              >
                <PanelLeftClose size={16} strokeWidth={1.75} />
              </button>
            </div>
          )}
        </div>

        {collapsed ? (
          <div className="mb-2 flex flex-col items-center gap-1">
            <NotificationBell compact />
            <Tooltip label={t("appShell.expandMenu")}>
              <button
                onClick={toggleCollapsed}
                aria-label={t("appShell.expandMenu2")}
                className="grid size-[30px] place-items-center rounded-md text-chrome-ink-faint transition-colors hover:bg-chrome-hover hover:text-chrome-ink"
              >
                <PanelLeftOpen size={16} strokeWidth={1.75} />
              </button>
            </Tooltip>
            <Tooltip label={t("appShell.searchK")}>
              <button
                onClick={openPalette}
                aria-label={t("common.search")}
                className="grid size-[30px] place-items-center rounded-md text-chrome-ink-faint transition-colors hover:bg-chrome-hover hover:text-chrome-ink"
              >
                <Search size={16} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="mb-2 px-1">
            <HeaderSearch />
          </div>
        )}

        <nav
          className={`flex flex-col gap-px ${collapsed ? "items-center" : "px-1"}`}
        >
          <NavItem
            collapsed={collapsed}
            href="/dashboard"
            label={t("common.home")}
            icon={House}
            active={pathname === "/dashboard" || pathname === "/team" || pathname.startsWith("/reports")}
            count={urgent}
            urgent
          />
          <NavItem
            collapsed={collapsed}
            href="/projects"
            label={t("common.projects")}
            icon={FolderKanban}
            active={pathname === "/projects"}
          />
        </nav>

        <div
          className={`mt-5 min-h-0 flex-1 overflow-y-auto ${collapsed ? "flex flex-col items-center" : "px-1"}`}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-px border-t border-chrome-line pt-3">
              {projects.map((p) => {
                const active = pathname === `/projects/${p.id}`;
                return (
                  <Tooltip key={p.id} label={p.title}>
                    <Link
                      href={`/projects/${p.id}`}
                      aria-current={active ? "page" : undefined}
                      aria-label={p.title}
                      className={`grid size-[30px] place-items-center rounded-md transition-colors ${active ? "bg-chrome-active" : "hover:bg-chrome-hover"}`}
                    >
                      <LetterMark name={p.title} size={18} />
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          ) : (
            <>
              <button
                onClick={() => setProjectsOpen((o) => !o)}
                aria-expanded={projectsOpen}
                className="flex h-7 w-full items-center gap-1 rounded-md px-2 text-xs text-chrome-ink-faint transition-colors hover:text-chrome-ink"
              >
                
                {t("settings.templates.id.inProgress")}
                <ChevronDown
                  size={12}
                  className={`transition-transform ${projectsOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {projectsOpen && (
                <div className="flex flex-col gap-px">
                  {projects.length === 0 && (
                    <p className="px-2 py-1 text-xs text-chrome-ink-faint">
                      
                      {t("appShell.noActiveProjects")}
                    </p>
                  )}
                  {projects.map((p) => {
                    const active = pathname === `/projects/${p.id}`;
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        aria-current={active ? "page" : undefined}
                        title={p.title}
                        className={`flex h-[30px] items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${
                          active
                            ? "bg-chrome-active font-medium text-chrome-ink"
                            : "text-chrome-ink-soft hover:bg-chrome-hover hover:text-chrome-ink"
                        }`}
                      >
                        <LetterMark name={p.title} size={16} />
                        <span className="min-w-0 flex-1 truncate">
                          {p.title}
                        </span>
                        <span className="text-xs text-chrome-ink-faint">
                          {p.openCards ?? p._count.cards}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div
          className={`mt-2 shrink-0 border-t border-chrome-line pt-2 ${collapsed ? "flex justify-center" : "px-1"}`}
        >
          <Popover
            align="left"
            side="top"
            trigger={(open, toggle) => (
              <button
                onClick={toggle}
                aria-expanded={open}
                aria-label={t("appShell.userMenu")}
                className={`flex h-9 min-w-0 items-center gap-2 rounded-md px-1.5 text-chrome-ink transition-colors hover:bg-chrome-hover ${collapsed ? "" : "w-full"}`}
              >
                <Avatar user={user} size={22} />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left text-sm">
                      {user.name}
                    </span>
                    <ChevronUp
                      size={14}
                      className="shrink-0 text-chrome-ink-faint"
                    />
                  </>
                )}
              </button>
            )}
          >
            {() => (
              <div className="w-[240px]">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <Avatar user={user} size={28} />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-medium">
                      {user.name}
                    </div>
                    <div className="truncate text-xs text-ink-ghost">
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="my-1 h-px bg-border" />
                <Link
                  href="/settings"
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-soft"
                >
                  <Settings size={15} strokeWidth={1.75} className="text-ink-ghost" />  {t("common.settings")}
                </Link>
                <Link
                  href="/profile"
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-soft"
                >
                  <UserCog
                    size={15}
                    strokeWidth={1.75}
                    className="text-ink-ghost"
                  />{" "}
                  
                  {t("common.profile")}
                </Link>
                {SUPPORT.url && (
                  <a
                    href={SUPPORT.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-soft"
                  >
                    <LifeBuoy size={15} strokeWidth={1.75} className="text-ink-ghost" />  {t("appShell.support")}
                  </a>
                )}
                <button
                  onClick={() => {
                    setToken(null);
                    router.replace("/login");
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-soft"
                >
                  <LogOut
                    size={15}
                    strokeWidth={1.75}
                    className="text-ink-ghost"
                  />{" "}
                  
                  {t("appShell.signOut")}
                </button>
              </div>
            )}
          </Popover>
        </div>
      </aside>

      {/* Work area: white sheet inset from the sidebar */}
      <main className="my-2 mr-2 min-w-0 flex-1 overflow-auto rounded-lg bg-bg">
        <BillingBanner />
        <div className="flex min-h-full flex-col px-6">{children}</div>
      </main>

      <Toaster />
    </div>
  );
}
