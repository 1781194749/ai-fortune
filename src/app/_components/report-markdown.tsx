import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function createComponents(variant: "dark" | "light"): Components {
  const heading = variant === "dark" ? "text-[#fff7e8]" : "text-[#17120b]";
  const body = variant === "dark" ? "text-[#d8cab2]" : "text-[#30291f]";
  const muted = variant === "dark" ? "text-[#b9ad99]" : "text-[#625746]";
  const border = variant === "dark" ? "border-[#3a3023]" : "border-[#d7c8a6]";
  const surface = variant === "dark" ? "bg-[#080705]" : "bg-white/55";

  return {
    h1: ({ children }) => <h1 className={`mb-3 mt-8 font-ritual text-3xl ${heading}`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`mb-3 mt-8 font-ritual text-2xl ${heading}`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`mb-2 mt-6 text-lg font-semibold ${heading}`}>{children}</h3>,
    p: ({ children }) => <p className={`my-3 whitespace-pre-line leading-8 ${body}`}>{children}</p>,
    strong: ({ children }) => <strong className={`font-semibold ${heading}`}>{children}</strong>,
    em: ({ children }) => <em className={muted}>{children}</em>,
    ul: ({ children }) => <ul className={`my-4 list-disc space-y-2 pl-6 marker:text-[#c8a15a] ${body}`}>{children}</ul>,
    ol: ({ children }) => <ol className={`my-4 list-decimal space-y-2 pl-6 marker:text-[#c8a15a] ${body}`}>{children}</ol>,
    li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
    blockquote: ({ children }) => <blockquote className={`my-5 border-l-2 border-[#c8a15a] px-4 py-2 ${surface} ${muted}`}>{children}</blockquote>,
    hr: () => <hr className={`my-7 border-0 border-t ${border}`} />,
    a: ({ href, children }) => {
      const external = href?.startsWith("http://") || href?.startsWith("https://");

      return <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="font-medium text-[#a77a31] underline underline-offset-4">{children}</a>;
    },
    table: ({ children }) => <div className={`my-5 overflow-x-auto rounded-lg border ${border}`}><table className="w-full min-w-[560px] border-collapse text-left text-sm">{children}</table></div>,
    th: ({ children }) => <th className={`border-b border-r px-4 py-3 font-semibold last:border-r-0 ${border} ${heading}`}>{children}</th>,
    td: ({ children }) => <td className={`border-b border-r px-4 py-3 align-top last:border-r-0 ${border} ${body}`}>{children}</td>,
    pre: ({ children }) => <pre className={`my-5 max-w-full overflow-x-auto rounded-lg border p-4 text-xs leading-6 ${border} ${surface} ${body}`}>{children}</pre>,
    code: ({ children }) => <code className={`rounded px-1.5 py-0.5 font-mono text-[0.9em] ${surface}`}>{children}</code>,
    img: ({ alt }) => <span className={muted}>{alt ? `[图片：${alt}]` : "[图片]"}</span>,
  };
}

export function ReportMarkdown({
  content,
  variant = "dark",
}: {
  content: string;
  variant?: "dark" | "light";
}) {
  return (
    <div className="min-w-0 text-sm leading-8">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={createComponents(variant)} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
