import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-7 text-[22px] font-semibold leading-8 tracking-[-0.01em] text-[#f2eadc] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-7 text-[19px] font-semibold leading-8 text-[#eee6d8] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-6 text-[16px] font-semibold leading-7 text-[#e8decd] first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-3 leading-8 text-[#d5cdbf] first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[#f1e8d8]">{children}</strong>
  ),
  em: ({ children }) => <em className="text-[#c9c0b2]">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-4 list-disc space-y-1.5 pl-6 marker:text-[#c9a35f]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 list-decimal space-y-1.5 pl-6 marker:font-medium marker:text-[#c9a35f]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-7 text-[#d5cdbf]">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-2 border-[#c9a35f]/55 bg-[#c9a35f]/[0.045] py-2 pl-4 pr-3 text-[#bdb4a6]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-7 border-0 border-t border-[#292a24]" />,
  a: ({ href, children }) => {
    const external = href?.startsWith("http://") || href?.startsWith("https://");

    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="font-medium text-[#d8b873] underline decoration-[#c9a35f]/40 underline-offset-4 transition hover:text-[#f0d49a] hover:decoration-[#c9a35f]"
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="xuanji-scrollbar my-5 max-w-full overflow-x-auto rounded-xl border border-[#313229] bg-[#0d0e0c] shadow-[0_10px_28px_rgba(0,0,0,0.16)]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm [&_tr:last-child_td]:border-b-0">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#171813]">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-[#292a24]">{children}</tbody>,
  tr: ({ children }) => (
    <tr className="transition-colors duration-150 hover:bg-[#171813]/65">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="border-b border-r border-[#313229] px-4 py-3 font-medium leading-6 text-[#eee6d8] last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-r border-[#292a24] px-4 py-3 align-top leading-6 text-[#c7bfb2] last:border-r-0">
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <pre className="xuanji-scrollbar my-5 max-w-full overflow-x-auto rounded-xl border border-[#2c2d27] bg-[#090a08] p-4 text-[13px] leading-6 text-[#d5cdbf] [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code
      className={`${className ?? ""} rounded-md bg-[#20211c] px-1.5 py-0.5 font-mono text-[0.88em] text-[#ead9b3]`}
    >
      {children}
    </code>
  ),
  del: ({ children }) => <del className="text-[#8e877d] decoration-[#8e877d]">{children}</del>,
  input: (props) => (
    <input {...props} className="mr-2 accent-[#c9a35f]" disabled />
  ),
  img: ({ alt }) => (
    <span className="text-xs text-[#777168]">{alt ? `[图片：${alt}]` : "[图片]"}</span>
  ),
};

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
}: {
  content: string;
}) {
  return (
    <div className="min-w-0 text-[15px] leading-8 text-[#d5cdbf]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
});
