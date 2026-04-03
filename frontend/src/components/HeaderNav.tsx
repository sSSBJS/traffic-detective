const navItems = [
  { href: "#section-1", label: "Our Project" },
  { href: "#section-2", label: "Our Work" },
  { href: "#section-3", label: "Gallery" },
  { href: "#section-4", label: "Output Image" },
];

export function HeaderNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <a href="#section-1" className="flex items-center gap-3 text-slate-900 no-underline">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white shadow-soft">
            PD
          </div>
          <div>
            <p className="m-0 text-xs uppercase tracking-[0.35em] text-slate-500">Project</p>
            <p className="m-0 text-lg font-bold">Didimdol</p>
          </div>
        </a>

        <nav className="hidden gap-3 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 no-underline transition hover:bg-slate-900 hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
