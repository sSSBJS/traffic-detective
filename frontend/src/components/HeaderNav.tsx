const navItems = [
  { href: "#dashboard", label: "대시보드" },
  { href: "#forecast", label: "그래프" },
  { href: "#report", label: "보고서" },
  { href: "#session-history", label: "세션 기록" },
];

export function HeaderNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <a href="#dashboard" className="flex items-center gap-3 text-slate-900 no-underline">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white">
            TA
          </div>
          <div>
            <p className="m-0 text-xs font-semibold text-slate-500">Traffic AIOps</p>
            <p className="m-0 text-lg font-bold">Studio</p>
          </div>
        </a>

        <nav className="hidden gap-2 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 no-underline transition hover:bg-slate-950 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
