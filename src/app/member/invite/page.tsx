import { Gift } from "lucide-react";
import { getInviteRewardSummary } from "@/lib/invite-rewards";
import { getRequiredMemberSession } from "../member-data";
import { PageHeader, Panel } from "../member-ui";
import { InviteRewardCard } from "../invite-reward-card";

export default async function MemberInvitePage() {
  const session = await getRequiredMemberSession();
  const inviteRewardSummary = await getInviteRewardSummary(session.userId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invite"
        title="邀请有礼"
        description="邀请链接、奖励规则、邀请成果独立管理，不再塞在账户概览里。"
      />

      <InviteRewardCard summary={inviteRewardSummary} />

      <Panel title="奖励规则" description="当前邀请活动配置" icon={Gift}>
        <div className="grid gap-px bg-[#20252d] sm:grid-cols-3">
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">邀请人奖励</p>
            <p className="mt-3 text-2xl font-semibold text-[#8ad5bd]">+{inviteRewardSummary.inviterStarGrant}</p>
            <p className="mt-2 text-xs text-[#8d98a8]">新人完成注册后发放</p>
          </div>
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">新人星力</p>
            <p className="mt-3 text-2xl font-semibold text-[#f4efe5]">+{inviteRewardSummary.inviteeStarGrant}</p>
            <p className="mt-2 text-xs text-[#8d98a8]">注册后进入账户</p>
          </div>
          <div className="bg-[#101318] p-5">
            <p className="text-xs text-[#697386]">新人报告额度</p>
            <p className="mt-3 text-2xl font-semibold text-[#f4efe5]">+{inviteRewardSummary.inviteeDeepReportGrant}</p>
            <p className="mt-2 text-xs text-[#8d98a8]">用于深度报告</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
