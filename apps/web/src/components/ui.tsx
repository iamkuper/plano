"use client";

// Component library — Linear-like: hairlines instead of shadows, neutral
// chrome, one accent for interaction. Tokens: src/design/tokens.ts.
// Rules: /.ux-profile.md and DESIGN_SYSTEM.md.
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Loader2, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { labelColor, statusColor as STATUS_COLORS } from "@/design/tokens";

/* ───────────────────────────── Actions ───────────────────────────── */

export type ButtonVariant = "primary" | "accent" | "outline" | "subtle" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover", // the main action on a screen
  accent: "bg-accent text-white hover:bg-accent-hover",
  outline: "border border-border bg-surface text-ink hover:border-border-strong hover:bg-surface-soft",
  subtle: "bg-surface-soft text-ink hover:bg-surface-sunken",
  ghost: "text-ink-faint hover:bg-surface-soft hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90", // confirm button in destructive dialogs
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-sm",
  md: "h-8 gap-2 px-3 text-sm",
};

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

// Icon-only button. `title` is the tooltip and the accessible name.
export function IconButton({
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md" }) {
  return (
    <button
      aria-label={props["aria-label"] ?? props.title}
      className={`inline-flex shrink-0 items-center justify-center rounded-md text-ink-ghost transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-40 ${
        size === "sm" ? "size-6" : "size-7"
      } ${className}`}
      {...props}
    />
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" aria-hidden />;
}

/* ──────────────────────────── Data display ──────────────────────────── */

export type BadgeTone = "default" | "primary" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  default: "bg-surface-sunken text-ink-faint",
  primary: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

// Status label (project/user state). Not for ordinary metadata.
export function Badge({ tone = "default", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

// Category marker: a coloured glyph/dot + plain text. No pill.
export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-faint">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

// Label: colour dot + name (same quiet style as Tag).
export function LabelTag({ label }: { label: { name: string; color: keyof typeof labelColor } }) {
  return <Tag color={labelColor[label.color] ?? labelColor.gray}>{label.name}</Tag>;
}

export type StatusTone = keyof typeof STATUS_COLORS;

export function columnTone(index: number, count: number): StatusTone {
  if (index === 0) return "todo";
  if (index === count - 1) return "done";
  return "progress";
}

export const STATUS_DOT = STATUS_COLORS;
export const statusColor = (tone: StatusTone) => STATUS_COLORS[tone];

export function StatusDot({ tone, color }: { tone?: StatusTone; color?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: color ?? STATUS_COLORS[tone ?? "todo"] }}
    />
  );
}

export function ShareBar({
  value,
  tone = "accent",
  color,
}: {
  value: number;
  tone?: "accent" | "success" | "danger" | StatusTone;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = color ? "" : tone === "accent" ? "bg-accent" : tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "";
  const bg = color ?? (fill ? undefined : STATUS_COLORS[tone as StatusTone]);
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%`, ...(bg ? { background: bg } : {}) }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-surface px-1 font-sans text-xs text-ink-ghost">
      {children}
    </kbd>
  );
}

/* ───────────────────────────── Layout ───────────────────────────── */

// 48px page bar: breadcrumb path and title on one line, actions on the right.
export function PageHeader({
  crumbs = [],
  title,
  subtitle,
  actions,
  meta,
}: {
  crumbs?: { label: string; href?: string }[];
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-6 mb-0 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg px-6">
      <nav aria-label="Навигационная цепочка" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5 text-ink-faint">
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span className="truncate">{c.label}</span>
            )}
            <ChevronRight size={14} className="shrink-0 text-ink-ghost" />
          </span>
        ))}
        <h1 className="truncate font-medium text-ink">{title}</h1>
        {meta}
      </nav>
      {subtitle && <span className="hidden truncate text-sm text-ink-ghost lg:inline">{subtitle}</span>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

// Page body under a PageHeader.
export function PageBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`py-5 ${className}`}>{children}</div>;
}

export function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border border-border bg-surface ${className}`}>{children}</div>;
}

export function Card({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-4 pt-3.5">
          <div>
            {title && <h2 className="text-base font-medium">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-faint">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  tone?: "danger" | "success";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
      <div className="text-sm text-ink-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-ghost">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Icon size={22} strokeWidth={1.75} className="text-ink-ghost" />
      <h3 className="mt-3 text-base font-medium">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-faint">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-sunken ${className}`} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-3 border-b border-border px-4 last:border-b-0">
          <Skeleton className="size-5" />
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Navigation ───────────────────────────── */

// Segmented control: plain text items, the selected one on a grey chip.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: LucideIcon; count?: number }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex items-center gap-0.5">
      {options.map(({ value: v, label: text, icon: Icon, count }) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors ${
            value === v ? "bg-surface-sunken font-medium text-ink" : "text-ink-faint hover:bg-surface-soft hover:text-ink"
          }`}
        >
          {Icon && <Icon size={15} strokeWidth={1.75} />}
          {text}
          {count !== undefined && <span className="text-xs text-ink-ghost">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Tabs = Segmented;

/* ───────────────────────────── Overlays ───────────────────────────── */

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const floating = "animate-dialog-in absolute z-30 rounded-lg border border-border bg-surface p-1 shadow-raised";

export function Popover({
  trigger,
  children,
  align = "right",
  side = "bottom",
}: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={`${floating} min-w-[220px] ${align === "right" ? "right-0" : "left-0"} ${
            side === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  selected,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  selected?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-soft ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {Icon && <Icon size={15} strokeWidth={1.75} className={danger ? "" : "text-ink-ghost"} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check size={14} className="text-accent" />}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-xs text-ink-ghost first:pt-1">{children}</div>;
}

export function Menu({
  items,
  className = "",
}: {
  items: { label: string; onClick: () => void; danger?: boolean; icon?: LucideIcon }[];
  className?: string;
  horizontal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <IconButton size="sm" onClick={() => setOpen((o) => !o)} title="Действия" aria-haspopup="menu" aria-expanded={open}>
        <MoreHorizontal size={15} />
      </IconButton>
      {open && (
        <div role="menu" className={`${floating} right-0 top-full mt-1 min-w-[200px]`}>
          {items.map((item) => (
            <MenuItem
              key={item.label}
              icon={item.icon}
              danger={item.danger}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  );
}

export function Tooltip({ label, children, side = "right" }: { label: string; children: React.ReactNode; side?: "right" | "bottom" }) {
  const pos = side === "right" ? "left-full top-1/2 ml-2 -translate-y-1/2" : "left-1/2 top-full mt-1.5 -translate-x-1/2";
  return (
    <div className="group/tt relative">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-dark px-2 py-1 text-xs text-white opacity-0 ring-1 ring-white/15 transition-opacity delay-300 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100 ${pos}`}
      >
        {label}
      </span>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  width = "max-w-md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay p-4 md:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`animate-dialog-in w-full ${width} rounded-xl border border-border bg-surface shadow-raised`}>
        <div className="flex items-start justify-between gap-4 px-5 pb-1 pt-4">
          <div>
            <h2 className="text-md font-medium">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-faint">{description}</p>}
          </div>
          <IconButton onClick={onClose} title="Закрыть">
            <X size={16} />
          </IconButton>
        </div>
        <div className="px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}

// Destructive confirmation: names the entity, Cancel focused by default,
// destructive verb on the confirm button.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-overlay p-4 md:pt-[18vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="animate-dialog-in w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-raised">
        <h2 className="text-md font-medium">{title}</h2>
        {body && <div className="mt-1.5 text-sm text-ink-faint">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button autoFocus onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Large centred window over a dimmed page (card details). Closes on
// Escape (handled by the caller) and on a click outside the window.
export function Modal({
  label,
  onClose,
  children,
  width = "max-w-[1040px]",
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  // Lock page scroll while the window is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(17,18,22,0.5)] p-4 md:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`animate-dialog-in flex h-[min(860px,calc(100vh-64px))] w-full ${width} flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-raised`}
      >
        {children}
      </div>
    </div>
  );
}

// Right-hand panel over the current view.
export function Sheet({
  label,
  onClose,
  children,
  width = "max-w-[960px]",
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label} className={`animate-sheet-in flex h-full w-full ${width} flex-col overflow-hidden border-l border-border bg-surface shadow-raised`}>
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────────── Forms ───────────────────────────── */

const control =
  "w-full rounded-md border bg-surface text-sm text-ink outline-none transition-colors placeholder:text-ink-ghost focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-surface-soft disabled:text-ink-faint";
const controlState = (invalid?: boolean) =>
  invalid ? "border-danger focus:border-danger focus:ring-danger/15" : "border-border hover:border-border-strong";

export const inputClass = `${control} ${controlState()} h-8 px-2.5`;
export const textareaClass = `${control} ${controlState()} px-2.5 py-2`;

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode | ((props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode);
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  const a11y = { id, "aria-describedby": note ? noteId : undefined, "aria-invalid": error ? true : undefined };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {typeof children === "function" ? children(a11y) : children}
      {note && (
        <p id={noteId} className={`mt-1 text-xs ${error ? "text-danger" : "text-ink-ghost"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className = "", ...props }, ref) {
    return <input ref={ref} className={`${control} ${controlState(invalid)} h-8 px-2.5 ${className}`} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className = "", ...props }, ref) {
    return <textarea ref={ref} className={`${control} ${controlState(invalid)} px-2.5 py-2 ${className}`} {...props} />;
  },
);

export function Select({
  invalid,
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select className={`${control} ${controlState(invalid)} h-8 cursor-pointer appearance-none pl-2.5 pr-8 ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-ghost" />
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`grid size-4 shrink-0 place-items-center rounded-sm border transition-colors ${
        checked ? "border-accent bg-accent text-white" : "border-border-strong bg-surface hover:border-ink-ghost"
      } ${className}`}
    >
      {checked && <Check size={11} strokeWidth={3} />}
    </button>
  );
}

/* ───────────────────────────── Tables ───────────────────────────── */

export const th = "h-9 whitespace-nowrap border-b border-border px-4 text-left text-xs font-medium text-ink-ghost";
export const td = "h-11 border-b border-border px-4 align-middle text-base group-last:border-b-0";
export const tr = "group transition-colors hover:bg-surface-soft";
