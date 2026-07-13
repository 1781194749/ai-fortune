import Link from "next/link";
import { notFound } from "next/navigation";
import { Scale, Sparkles } from "lucide-react";
import { getLegalDocument, getLegalEntity, legalDocuments, legalVersion } from "@/lib/legal";
import { brand } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return legalDocuments.map((document) => ({ slug: document.slug }));
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = getLegalDocument(slug);
  const legalEntity = getLegalEntity();

  if (!document) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#080705] px-5 py-8 text-[#f5efe2] sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-[#c8a15a]/55 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-ritual text-xl">{brand.cn}</span>
            <span className="block text-xs text-[#b9ad99]">{brand.en}</span>
          </span>
        </Link>
        <Link href="/" className="text-sm text-[#d8cab2] hover:text-[#f0d49a]">
          返回首页
        </Link>
      </div>

      <article className="mx-auto mt-12 max-w-5xl rounded-lg border border-[#3a3023] bg-[#12100d] p-6">
        <div className="flex items-center gap-3 border-b border-[#2f261a] pb-6">
          <span className="flex size-12 items-center justify-center rounded-lg border border-[#c8a15a]/50 bg-[#c8a15a]/10 text-[#f0d49a]">
            <Scale size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm text-[#b9ad99]">版本日期：{legalVersion}</p>
            <h1 className="font-ritual text-4xl text-[#fff7e8]">{document.title}</h1>
          </div>
        </div>

        <p className="mt-6 rounded-md border border-[#2f261a] bg-[#080705] p-4 leading-7 text-[#d8cab2]">
          {document.summary}
        </p>

        {(legalEntity.companyName || legalEntity.icpRecordNo) ? (
          <div className="mt-4 grid gap-3 rounded-md border border-[#2f261a] bg-[#080705] p-4 text-sm leading-7 text-[#b9ad99] sm:grid-cols-2">
            {legalEntity.companyName ? (
              <p>
                运营主体：<span className="text-[#d8cab2]">{legalEntity.companyName}</span>
              </p>
            ) : null}
            {legalEntity.icpRecordNo ? (
              <p>
                ICP 备案号：<span className="text-[#d8cab2]">{legalEntity.icpRecordNo}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 space-y-8">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-ritual text-3xl text-[#fff7e8]">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-8 text-[#d8cab2]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-md border border-[#5d2b22] bg-[#160c09] p-4 text-sm leading-7 text-[#d8cab2]">
          本页面为产品合规模板，不构成法律意见。正式上线前，应结合经营主体、上线地区、支付渠道、云服务供应商和实际数据流进行律师审查。
        </div>
      </article>
    </main>
  );
}
