"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@plano/shared";
// Route-backed tabs shown next to a page title (Главная, Настройки).
// `exact` tabs match only their own path, the rest also match sub-paths.
export function TabLinks({ tabs, label }: { tabs: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label={label} className="ml-3 inline-flex items-center gap-0.5">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            role="tab"
            aria-selected={active}
            className={`flex h-7 items-center rounded-md px-2.5 text-sm transition-colors ${
              active ? "bg-surface-sunken font-medium text-ink" : "text-ink-faint hover:bg-surface-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export const HomeTabs = () => (
  <TabLinks
    label={t("tabLinks.sections")}
    tabs={[
      { href: "/dashboard", label: t("common.overview") },
      { href: "/team", label: t("tabLinks.tasks") },
      { href: "/reports/time", label: t("tabLinks.time") },
    ]}
  />
);

export const SettingsTabs = () => (
  <TabLinks
    label={t("tabLinks.settingsSections")}
    tabs={[
      { href: "/settings", label: t("tabLinks.general"), exact: true },
      { href: "/settings/users", label: t("tabLinks.staffAndPermissions") },
      { href: "/settings/templates", label: t("common.templates") },
      { href: "/settings/agents", label: t("tabLinks.agents") },
      { href: "/settings/fields", label: t("tabLinks.fields") },
      { href: "/settings/audit", label: t("tabLinks.log") },
      { href: "/settings/billing", label: t("tabLinks.billing") },
    ]}
  />
);
