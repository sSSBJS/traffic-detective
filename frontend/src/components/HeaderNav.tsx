const navItems = [
  { href: "#dashboard", label: "대시보드" },
  { href: "#forecast", label: "그래프" },
  { href: "#report", label: "보고서" },
  { href: "#session-history", label: "세션 기록" },
];

type HeaderNavProps = {
  statusLabel: string;
  datasetId?: string;
  metric?: string;
};

export function HeaderNav({ statusLabel, datasetId = "—", metric = "—" }: HeaderNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <a
          href="#dashboard"
          className="group flex min-w-0 items-center gap-3 text-zinc-100 no-underline"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-sm font-bold text-cyan-200 shadow-sm ring-1 ring-cyan-300/10 transition group-hover:border-cyan-300/50">
            AI
          </div>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-cyan-300/80">
              Model Operations
            </p>
            <p className="m-0 truncate text-lg font-semibold text-zinc-100">Traffic Control Room</p>
          </div>
        </a>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/70 p-1">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 no-underline transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="grid grid-cols-3 gap-2 text-xs sm:flex sm:items-center">
            <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Status</p>
              <p className="m-0 mt-0.5 truncate font-semibold text-emerald-300">{statusLabel}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Dataset</p>
              <p className="m-0 mt-0.5 truncate font-mono text-zinc-200">{datasetId}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
              <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Metric</p>
              <p className="m-0 mt-0.5 truncate font-mono text-zinc-200">{metric}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
