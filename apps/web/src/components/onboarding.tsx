"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Rocket, X } from "lucide-react";
import { api, type OnboardingDto } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button, Card, Dialog } from "./ui";
import { t } from "@plano/shared";
// First-run help on the home page: a welcome dialog once, then a checklist
// that ticks itself as the person does the real things. Both can be closed
// for good; "Показать начало работы" in the profile brings the checklist back.
export function Onboarding() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.onboarding().then(setData).catch(() => {});
  }, []);
  useEffect(load, [load]);
  // Steps are completed elsewhere in the app: re-check when coming back.
  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  if (!data || data.closed) return null;
  const owner = data.kind === "owner";
  const allDone = data.completed === data.steps.length;

  async function close() {
    await api.onboardingClose().catch(() => {});
    setData((d) => d && { ...d, closed: true, welcomeSeen: true });
  }

  async function sample() {
    setBusy(true);
    try {
      const { id } = await api.createSampleProject();
      await api.onboardingWelcomeSeen().catch(() => {});
      toast(t("onboarding.sampleProjectCreated"), "success");
      router.push(`/projects/${id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <>
      {!data.welcomeSeen && (
        <Dialog
          title={owner ? t("onboarding.welcomeToPlano") : t("onboarding.welcomeToTheTeam")}
          description={owner ? t("onboarding.letSGoThroughThe") : t("onboarding.hereYouWillSeeThe")}
          onClose={() => {
            api.onboardingWelcomeSeen().catch(() => {});
            setData({ ...data, welcomeSeen: true });
          }}
        >
          <div className="space-y-4">
            <ul className="space-y-1.5 text-base text-ink-soft">
              {data.steps.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-ghost" />
                  {s.title}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button onClick={close}>{t("onboarding.noNeedClose")}</Button>
              {owner && (
                <Button loading={busy} onClick={sample}>
                  
                  {t("onboarding.createASampleProject")}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  api.onboardingWelcomeSeen().catch(() => {});
                  setData({ ...data, welcomeSeen: true });
                }}
              >
                
                {t("onboarding.getStarted")}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      <Card
        title={allDone ? t("onboarding.allDone") : t("common.gettingStarted")}
        description={allDone ? t("onboarding.theMainStepsAreComplete") : t("onboarding.completedOf", { completed: data.completed, steps: data.steps.length })}
        action={
          <button onClick={close} aria-label={t("onboarding.hideGettingStarted")} title={t("onboarding.hide")} className="grid size-7 place-items-center rounded-md text-ink-ghost hover:bg-surface-sunken hover:text-ink">
            <X size={16} strokeWidth={1.75} />
          </button>
        }
      >
        <div className="mb-3 h-1 rounded-full bg-surface-sunken" role="progressbar" aria-label={t("onboarding.progress")} aria-valuenow={data.completed} aria-valuemax={data.steps.length}>
          <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${(data.completed / data.steps.length) * 100}%` }} />
        </div>
        <ol className="divide-y divide-border">
          {data.steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 py-2.5" data-step={s.id} data-done={s.done}>
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-xs ${s.done ? "border-accent bg-accent text-white" : "border-border-strong text-ink-faint"}`}>
                {s.done ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-base ${s.done ? "text-ink-faint line-through" : ""}`}>{s.title}</div>
                {!s.done && <div className="text-sm text-ink-faint">{s.description}</div>}
              </div>
              {!s.done && (
                <Link href={s.action.href}>
                  <Button size="sm">{s.action.label}</Button>
                </Link>
              )}
            </li>
          ))}
        </ol>
        {allDone && (
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={close}>
              <Rocket size={15} />  {t("onboarding.doneHide")}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
