import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-0 border-b border-zinc-700 pb-2 text-lg font-semibold tracking-tight text-zinc-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-6 text-base font-semibold text-zinc-100 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold text-zinc-200">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 text-sm leading-relaxed text-zinc-400 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-400">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-400">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-zinc-600">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-violet-400 underline decoration-violet-500/40 underline-offset-2 hover:text-violet-300"
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-violet-500/40 bg-zinc-900/50 py-2 pl-3 text-sm text-zinc-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-zinc-700" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full min-w-[280px] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-zinc-800 text-xs font-semibold text-zinc-400">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-zinc-800 text-zinc-300">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 tabular-nums-pro">{children}</td>,
  code: ({ className, children, ...rest }) => {
    const isFence = Boolean(className?.startsWith("language-"));
    if (!isFence) {
      return (
        <code
          className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-violet-200"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className ?? ""} font-mono text-xs text-zinc-100`} {...rest}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-zinc-700 bg-black/40 p-3 text-zinc-100">
      {children}
    </pre>
  ),
};

type Props = {
  markdown: string;
  className?: string;
};

export function ReportMarkdown({ markdown, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
