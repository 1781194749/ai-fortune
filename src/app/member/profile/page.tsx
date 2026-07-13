import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Target, UserRound } from "lucide-react";
import { formatBirthDate } from "@/lib/birth-calendar";
import { getFortuneProfile } from "@/lib/fortune-profile-store";
import { getRequiredMemberSession } from "../member-data";
import { PageHeader, Panel } from "../member-ui";

export default async function MemberProfilePage() {
  const session = await getRequiredMemberSession();
  const profile = await getFortuneProfile(session.userId);
  const birthSummary = formatBirthDate(profile?.birthDate, profile?.calendarType);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profile"
        title="命理档案"
        description="这里只管理你的基础资料和长期关注方向。档案越清楚，后续对话越少重复背景。"
        action={{ href: "/onboarding?edit=1", label: profile ? "编辑档案" : "创建档案", icon: UserRound }}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "称呼", value: profile?.name || "待补充", icon: UserRound },
          { label: "出生日期", value: birthSummary || "待补充", icon: CalendarDays },
          { label: "出生时辰", value: profile?.birthTime || "待补充", icon: Clock3 },
          { label: "出生地点", value: profile?.birthPlace || "待补充", icon: MapPin },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.label} className="rounded-lg border border-[#252a32] bg-[#101318] p-4">
              <div className="flex items-center gap-2 text-xs text-[#697386]">
                <Icon size={14} aria-hidden="true" />
                {item.label}
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-medium text-[#d7dee8]">{item.value}</p>
            </article>
          );
        })}
      </section>

      <Panel title="关注方向" description="关系、事业与长期议题" icon={Target}>
        <div className="grid gap-px bg-[#20252d] sm:grid-cols-2">
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">关系状态</p>
            <p className="mt-3 text-sm text-[#d7dee8]">{profile?.relationshipStatus || "待补充"}</p>
          </div>
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">事业关注</p>
            <p className="mt-3 text-sm text-[#d7dee8]">{profile?.careerFocus || "待补充"}</p>
          </div>
          <div className="bg-[#101318] p-5 sm:col-span-2">
            <p className="text-xs text-[#697386]">长期关注</p>
            <div className="mt-3 flex min-h-7 flex-wrap gap-2">
              {profile?.recurringTopics.length ? (
                profile.recurringTopics.map((topic) => (
                  <span key={topic} className="rounded-md border border-[#3c8b72]/28 bg-[#3c8b72]/8 px-2.5 py-1 text-xs text-[#8ad5bd]">{topic}</span>
                ))
              ) : (
                <span className="text-sm text-[#8d98a8]">未设置</span>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="AI 记忆摘要" description="系统当前用于个性化回答的摘要">
        <div className="p-5">
          <p className="rounded-lg border border-[#303642] bg-[#0b0d11] p-4 text-sm leading-7 text-[#c8d0dc]">
            {profile?.memorySummary || "暂无摘要。完善档案并完成对话后，这里会沉淀你的长期上下文。"}
          </p>
          <Link href="/onboarding?edit=1" className="mt-4 inline-flex h-9 items-center rounded-md border border-[#303642] px-3 text-sm text-[#d8b873] transition hover:border-[#c9a35f]/55 hover:bg-[#19160f]">
            更新档案
          </Link>
        </div>
      </Panel>
    </div>
  );
}
