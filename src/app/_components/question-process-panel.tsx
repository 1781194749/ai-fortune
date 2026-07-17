"use client";

import {
  BadgeCheck,
  CircleDashed,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export type QuestionProcessState = "idle" | "running" | "success" | "error";

export type QuestionProcessStep = {
  label: string;
  detail: string;
};

type ServiceBrief = {
  type: string;
  method: string;
  cost: string;
  output: string;
};

export function QuestionProcessPanel({
  title,
  service,
  steps,
  state,
  completedSteps,
  resultTitle,
  resultSummary,
  nextActions,
  errorMessage,
  onRetry,
}: {
  title: string;
  service: ServiceBrief;
  steps: readonly QuestionProcessStep[];
  state: QuestionProcessState;
  completedSteps?: string[];
  resultTitle?: string;
  resultSummary?: string;
  nextActions: readonly string[];
  errorMessage?: string;
  onRetry?: () => void;
}) {
  const stateLabel = state === "running"
    ? "生成中"
    : state === "success"
      ? "已完成"
      : state === "error"
        ? "可重试"
        : "发送前确认";

  return (
    <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5" aria-live="polite">
      <div className="flex flex-col gap-3 border-b border-[#2f261a] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#c8a15a]">{title}</p>
          <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">本次服务怎么进行</h2>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-[#4a3a25] bg-[#080705] px-3 py-1.5 text-xs text-[#f0d49a]">
          {state === "running" ? (
            <Loader2 className="animate-spin" size={14} aria-hidden="true" />
          ) : state === "success" ? (
            <BadgeCheck size={14} aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          {stateLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["类型", service.type],
          ["方式", service.method],
          ["预计消耗", service.cost],
          ["交付", service.output],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-[#2f261a] bg-[#080705] p-3">
            <p className="text-xs text-[#8f806d]">{label}</p>
            <p className="mt-1 text-sm leading-6 text-[#d8cab2]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => {
          const completed = state === "success";
          const running = state === "running" && index === 0;
          const label = completedSteps?.[index] ?? step.label;

          return (
            <div
              key={`${step.label}-${index}`}
              className={`rounded-md border p-3 transition ${
                completed
                  ? "border-[#3c8b72]/55 bg-[#102018]"
                  : running
                    ? "border-[#c8a15a]/75 bg-[#1a140b]"
                    : "border-[#2f261a] bg-[#080705]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-[#c8a15a]/12 text-sm text-[#f0d49a]">
                  {index + 1}
                </span>
                {completed ? (
                  <BadgeCheck className="text-[#3c8b72]" size={17} aria-hidden="true" />
                ) : running ? (
                  <Loader2 className="animate-spin text-[#c8a15a]" size={17} aria-hidden="true" />
                ) : (
                  <CircleDashed className="text-[#6f6455]" size={17} aria-hidden="true" />
                )}
              </div>
              <p className="mt-3 text-sm text-[#d8cab2]">{label}</p>
              <p className="mt-2 text-xs leading-5 text-[#8f806d]">{step.detail}</p>
            </div>
          );
        })}
      </div>

      {state === "success" ? (
        <div className="mt-5 rounded-md border border-[#3c8b72]/35 bg-[#102018] p-4">
          <p className="text-xs font-semibold text-[#79d1ae]">结论卡</p>
          <h3 className="mt-2 text-lg font-semibold text-[#fff7e8]">{resultTitle ?? "本次推演已完成"}</h3>
          {resultSummary ? (
            <p className="mt-2 text-sm leading-7 text-[#c9d8cf]">{resultSummary}</p>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {nextActions.map((action) => (
              <span key={action} className="rounded-md border border-[#3c8b72]/25 bg-[#080705] px-3 py-2 text-xs leading-5 text-[#b9d5c9]">
                {action}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="mt-5 rounded-md border border-[#b84b37]/35 bg-[#210f0a] p-4">
          <p className="text-sm font-semibold text-[#f0a08d]">这次没有生成报告，也不会写入报告中心。</p>
          <p className="mt-2 text-sm leading-7 text-[#d8a496]">
            {errorMessage ?? "服务临时没有完成，可以保留当前问题重新发起。"}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#d98572]/45 px-3 text-sm font-medium text-[#f0a08d] transition hover:border-[#f0a08d]"
            >
              <RefreshCw size={14} aria-hidden="true" />
              保留内容重试
            </button>
          ) : null}
        </div>
      ) : null}

      {state === "idle" ? (
        <p className="mt-5 rounded-md border border-[#2f261a] bg-[#080705] px-4 py-3 text-sm leading-7 text-[#b9ad99]">
          发送前请确认问题、方式和消耗。开始后会按步骤展示进展，完成后给出结论卡与可继续追问的方向。
        </p>
      ) : null}
    </section>
  );
}
