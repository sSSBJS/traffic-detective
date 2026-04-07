const navItems = [
  { href: "#dashboard", label: "대시보드" },
  { href: "#forecast", label: "그래프" },
  { href: "#report", label: "보고서" },
  { href: "#session-history", label: "세션 기록" },
];

export function HeaderNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-violet-500/15 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-8">
        <a
          href="#dashboard"
          className="group flex items-center gap-3 text-zinc-100 no-underline"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-900 text-sm font-bold tracking-tight text-white shadow-lg shadow-violet-950/40 ring-1 ring-violet-400/20 transition group-hover:shadow-violet-900/50">
            TA
          </div>
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Traffic AIOps
            </p>
            <p className="m-0 text-lg font-semibold tracking-tight text-zinc-100">Studio</p>
          </div>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-zinc-400 no-underline transition hover:bg-violet-500/10 hover:text-zinc-100"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
