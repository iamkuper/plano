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
    <div className="flex min-h-screen items-center justify-center bg-surface-soft p-4">
      <form onSubmit={onSubmit} className="w-full max-w-[360px] space-y-4 rounded-xl border border-border bg-surface p-6">
        <div className="mb-1">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-sm font-semibold text-white">A</span>
          <h1 className="mt-4 text-lg font-medium">{title}</h1>
          <p className="mt-0.5 text-sm text-ink-faint">{subtitle}</p>
        </div>
        {children}
      </form>
    </div>
  );
}
