"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  CompanionReviewKind,
  MemberCompanionState,
} from "@/lib/member-companion-store";
import { MetricCard, Panel } from "../member-ui";

type CompanionResponse =
  | { ok: true; state: MemberCompanionState; message?: string }
  | { ok: false; message?: string };

function formatDate(value: string | null) {
  if (!value) {
    return "待开启";
  }

  return new Date(value).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProgress(state: MemberCompanionState) {
  if (!state.theme) {
    return { elapsedDays: 0, remainingDays: 30, progress: 0 };
  }

  const start = new Date(state.theme.startedAt).getTime();
  const end = new Date(state.theme.endsAt).getTime();
  const duration = Math.max(1, end - start);
  const elapsed = Math.max(0, Math.min(duration, Date.now() - start));
  const elapsedDays = Math.min(30, Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1);

  return {
    elapsedDays,
    remainingDays: Math.max(0, 30 - elapsedDays),
    progress: Math.round((elapsed / duration) * 100),
  };
}

export function CompanionClient({ initialState }: { initialState: MemberCompanionState }) {
  const [state, setState] = useState(initialState);
  const [title, setTitle] = useState(initialState.theme?.title ?? "");
  const [context, setContext] = useState(initialState.theme?.context ?? "");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const progress = useMemo(() => getProgress(state), [state]);
  const weeklyCount = state.reviews.filter((review) => review.kind === "weekly").length;

  async function submitAction(payload: Record<string, unknown>, action: string) {
    setPendingAction(action);
    setMessage("");

    try {
      const response = await fetch("/api/member/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as CompanionResponse | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "操作失败，请稍后重试。");
      }

      setState(result.state);
      setTitle(result.state.theme?.title ?? "");
      setContext(result.state.theme?.context ?? "");
      setMessage(result.message ?? "已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "网络异常，请稍后重试。");
    } finally {
      setPendingAction(null);
    }
  }

  function generateReview(kind: CompanionReviewKind) {
    return submitAction({ action: "generate_review", kind }, `review-${kind}`);
  }

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="当前主题"
          value={state.theme ? "进行中" : "未设置"}
          detail={state.theme?.title ?? "先确定这 30 天最重要的问题"}
          icon={Target}
        />
        <MetricCard label="陪伴进度" value={progress.elapsedDays} suffix="/ 30 天" detail={`剩余 ${progress.remainingDays} 天`} icon={Route} />
        <MetricCard label="周复盘" value={weeklyCount} suffix="次" detail="每满 7 天开放一次" icon={CalendarCheck2} />
        <MetricCard
          label="阶段总结"
          value={state.reviews.some((review) => review.kind === "monthly") ? "已生成" : "待生成"}
          detail={state.availability.monthly.message}
          icon={CheckCircle2}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <Panel title="核心主题" description="30 天内可补充和调整描述，周期不会重复计算" icon={Target}>
          <form
            className="p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void submitAction({ action: "save_theme", title, context }, "save-theme");
            }}
          >
            {state.theme ? (
              <div className="mb-5">
                <div className="flex items-center justify-between gap-4 text-xs text-[#8d98a8]">
                  <span>{formatDate(state.theme.startedAt)} 开始</span>
                  <span>{formatDate(state.theme.endsAt)} 结束</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#242a33]">
                  <div className="h-full bg-[#c9a35f] transition-[width]" style={{ width: `${progress.progress}%` }} />
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="text-xs font-medium text-[#a8b0bd]">这 30 天最重要的主题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                placeholder="例如：是否接受新的工作机会"
                className="mt-2 h-11 w-full rounded-md border border-[#303642] bg-[#0b0d11] px-3 text-sm text-[#f4efe5] outline-none transition placeholder:text-[#596273] focus:border-[#c9a35f]/65"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-[#a8b0bd]">当前背景与希望得到的结果</span>
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                maxLength={500}
                rows={5}
                placeholder="补充现在的处境、限制条件，以及 30 天后你希望更清楚的事情。"
                className="mt-2 w-full resize-y rounded-md border border-[#303642] bg-[#0b0d11] px-3 py-3 text-sm leading-6 text-[#f4efe5] outline-none transition placeholder:text-[#596273] focus:border-[#c9a35f]/65"
              />
            </label>
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={`min-h-5 text-xs ${message.includes("失败") || message.includes("异常") || message.includes("请") ? "text-[#e08b74]" : "text-[#8ad5bd]"}`}>
                {message}
              </p>
              <button
                type="submit"
                disabled={pendingAction !== null || !title.trim()}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#c9a35f] px-4 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {pendingAction === "save-theme" ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                {state.theme ? "保存主题" : "开启 30 天陪伴"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="复盘计划" description="依据 Chat 中的真实对话自动整理" icon={RefreshCw}>
          <div className="divide-y divide-[#252a32]">
            {[
              {
                kind: "weekly" as const,
                label: "本周复盘",
                detail: state.availability.weekly.message,
                nextAt: state.availability.weekly.nextAt,
                available: state.availability.weekly.available,
                icon: CalendarCheck2,
              },
              {
                kind: "monthly" as const,
                label: "30 天阶段总结",
                detail: state.availability.monthly.message,
                nextAt: state.availability.monthly.nextAt,
                available: state.availability.monthly.available,
                icon: Sparkles,
              },
            ].map((item) => {
              const Icon = item.icon;
              const action = `review-${item.kind}`;

              return (
                <div key={item.kind} className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[#303642] bg-[#0b0d11] text-[#d8b873]">
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#d7dee8]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8d98a8]">{item.detail}</p>
                      {item.nextAt ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#697386]">
                          <Clock3 size={13} aria-hidden="true" />
                          预计 {formatDate(item.nextAt)} 开放
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!item.available || pendingAction !== null}
                    onClick={() => void generateReview(item.kind)}
                    className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#c9a35f]/45 bg-[#c9a35f]/8 px-3 text-sm text-[#efd9a6] transition hover:border-[#c9a35f]/70 hover:bg-[#c9a35f]/12 disabled:cursor-not-allowed disabled:border-[#303642] disabled:bg-[#11151b] disabled:text-[#697386]"
                  >
                    {pendingAction === action ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}
                    {item.available ? `生成${item.label}` : "暂未开放"}
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      <Panel title="阶段记录" description="周复盘与 30 天总结会按时间沉淀在这里" icon={Route}>
        {state.reviews.length > 0 ? (
          <div className="divide-y divide-[#252a32]">
            {state.reviews.map((review) => (
              <article key={review.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs text-[#d8b873]">{review.kind === "weekly" ? "WEEKLY REVIEW" : "30-DAY SUMMARY"}</p>
                    <h3 className="mt-1 text-base font-semibold text-[#f4efe5]">{review.title}</h3>
                  </div>
                  <span className="text-xs text-[#697386]">{formatDateTime(review.createdAt)}</span>
                </div>
                <p className="mt-4 text-sm leading-7 text-[#b9c0cb]">{review.summary}</p>
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-[#8d98a8]">本阶段信号</p>
                    <div className="mt-3 space-y-2">
                      {review.signals.map((signal) => (
                        <p key={signal} className="flex items-start gap-2 text-sm leading-6 text-[#c8d0dc]">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#8ad5bd]" />
                          {signal}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#8d98a8]">下一步行动</p>
                    <div className="mt-3 space-y-2">
                      {review.nextActions.map((action) => (
                        <p key={action} className="flex items-start gap-2 text-sm leading-6 text-[#c8d0dc]">
                          <CheckCircle2 size={14} className="mt-1 shrink-0 text-[#d8b873]" aria-hidden="true" />
                          {action}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="mt-5 text-xs text-[#697386]">本次关联 {review.chatCount} 条近期 Chat 记录</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
            <Clock3 size={21} className="text-[#697386]" aria-hidden="true" />
            <p className="mt-3 text-sm text-[#b9c0cb]">设置主题后，每满 7 天可生成一次 AI 周复盘。</p>
          </div>
        )}
      </Panel>
    </>
  );
}
