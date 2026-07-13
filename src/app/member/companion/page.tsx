import Link from "next/link";
import { ArrowRight, CalendarCheck2, Check, Route, Sparkles } from "lucide-react";
import { hasMemberCompanionAccess } from "@/lib/member-companion-access";
import { getMemberCompanionState } from "@/lib/member-companion-store";
import { getRequiredMemberSession } from "../member-data";
import { PageHeader, Panel } from "../member-ui";
import { CompanionClient } from "./companion-client";

export default async function MemberCompanionPage() {
  const session = await getRequiredMemberSession();
  const canUseCompanion = hasMemberCompanionAccess(session.tier);

  if (!canUseCompanion) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Key Stage Companion"
          title="关键阶段陪伴"
          description="围绕一个真正重要的问题连续跟进 30 天，把零散对话整理成可执行的阶段判断。"
        />

        <Panel title="30 天深度陪伴" description="¥99 会员专属能力" icon={Route}>
          <div className="grid gap-px bg-[#20252d] lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="bg-[#101318] p-5 sm:p-7">
              <p className="text-xs font-medium text-[#d8b873]">不是多一包次数，而是连续看同一个问题</p>
              <h2 className="mt-3 max-w-2xl text-xl font-semibold leading-8 text-[#f4efe5]">
                选择一个核心主题，玄机会把之后的相关对话接到同一条 30 天脉络里。
              </h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {[
                  ["01", "锁定一个主题", "事业选择、关系变化或正在推进的重要决定"],
                  ["02", "每周自动复盘", "读取近期 Chat 记录，整理变化、阻力和下一步"],
                  ["03", "生成阶段总结", "30 天结束后沉淀结论，确定下一周期优先事项"],
                ].map(([step, title, detail]) => (
                  <div key={step} className="border-l border-[#303642] pl-4">
                    <p className="text-xs text-[#697386]">{step}</p>
                    <p className="mt-2 text-sm font-medium text-[#d7dee8]">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-[#8d98a8]">{detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between bg-[#0d1015] p-5 sm:p-7">
              <div>
                <span className="inline-flex size-10 items-center justify-center rounded-md border border-[#c9a35f]/35 bg-[#c9a35f]/8 text-[#d8b873]">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <p className="mt-5 text-sm font-medium text-[#f4efe5]">开通后立即可设置核心主题</p>
                <div className="mt-4 space-y-3 text-sm text-[#a8b0bd]">
                  {["30 天主题跟踪", "4 次周复盘机会", "1 份阶段总结", "自动关联历史对话"].map((item) => (
                    <p key={item} className="flex items-center gap-2">
                      <Check size={14} className="shrink-0 text-[#8ad5bd]" aria-hidden="true" />
                      {item}
                    </p>
                  ))}
                </div>
              </div>
              <Link
                href="/pricing#plan-yearly"
                className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#c9a35f] px-4 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
              >
                查看 99 元陪伴方案
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  const state = await getMemberCompanionState(session.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Key Stage Companion"
        title="关键阶段陪伴"
        description="一次只跟进一个核心主题。每周根据真实对话复盘，30 天后形成阶段总结。"
        action={{ href: "/chat", label: "补充最新变化", icon: CalendarCheck2 }}
      />
      <CompanionClient initialState={state} />
    </div>
  );
}
