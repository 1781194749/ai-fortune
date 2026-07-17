"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CircleDashed,
  CircleDotDashed,
  FileText,
  GitCommitHorizontal,
  GitMerge,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { ChatAnswerShape, ChatConclusion, ChatIntent } from "@/lib/ai-orchestrator";
import { getChatServiceMode, type ChatServiceMode } from "@/lib/chat-service";
import type { ChatProgressData, ChatRitualItem } from "@/lib/chat-ui-message";
import type { FortuneAnswer } from "@/lib/prompts/contracts";

const processSteps = [
  { id: "classify", fallback: "辨识问意" },
  { id: "profile", fallback: "档案合参" },
  { id: "tool", fallback: "启用推演" },
  { id: "ritual", fallback: "结果显现" },
  { id: "answer", fallback: "顾问成文" },
] as const;

function ritualKey(item: ChatRitualItem) {
  if (item.kind === "tarot_card") return `tarot-${item.index}`;
  if (item.kind === "bagua_stage") return `bagua-${item.stage}`;
  return item.kind;
}

function latestRitualItems(progress: ChatProgressData[]) {
  const items = new Map<string, ChatRitualItem>();

  for (const event of progress) {
    if (event.ritualItem) {
      items.set(ritualKey(event.ritualItem), event.ritualItem);
    }
  }

  return [...items.values()];
}

function TarotRitual({ items, reduced }: { items: ChatRitualItem[]; reduced: boolean }) {
  const cards = items.filter((item): item is Extract<ChatRitualItem, { kind: "tarot_card" }> => item.kind === "tarot_card");
  const total = Math.min(10, Math.max(cards[0]?.total ?? 3, cards.length, 3));
  const indexes = Array.from({ length: total }, (_, index) => index);
  const gridClass = total <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-5";

  return (
    <div className={`grid ${gridClass} gap-2 sm:gap-3`} aria-label="塔罗逐张翻牌">
      {indexes.map((index) => {
        const card = cards.find((item) => item.index === index);

        return (
          <div key={index} className="aspect-[3/4] min-w-0 [perspective:700px]">
            <AnimatePresence mode="wait">
              {card ? (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, rotateY: reduced ? 0 : 88, scale: reduced ? 1 : 0.96 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 210, damping: 24 }}
                  className="flex h-full min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-[#c9a35f]/45 bg-[#1a1711] p-2 text-center shadow-[0_14px_32px_rgba(0,0,0,0.28)] sm:p-3"
                >
                  <span className="text-[9px] text-[#8f8068] sm:text-[10px]">{card.position}</span>
                  <div className="min-w-0">
                    <Sparkles className="mx-auto mb-2 text-[#d8b873]" size={16} aria-hidden="true" />
                    <p className="break-words text-xs font-semibold leading-5 text-[#f0e5d0] sm:text-sm">{card.title}</p>
                    <p className="mt-1 text-[9px] text-[#b89a62] sm:text-[10px]">{card.orientation}</p>
                  </div>
                  <p className="line-clamp-2 text-[9px] leading-4 text-[#82796b] sm:text-[10px]">{card.meaning}</p>
                </motion.div>
              ) : (
                <motion.div
                  key="back"
                  className="flex h-full items-center justify-center rounded-lg border border-[#343129] bg-[#12120f]"
                  exit={{ opacity: 0, rotateY: reduced ? 0 : -88 }}
                >
                  <span className="flex size-8 items-center justify-center rounded-full border border-[#413a2e] text-xs text-[#6f6558]">{index + 1}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

const baguaStages = [
  { id: "main", label: "本卦", icon: CircleDotDashed },
  { id: "moving", label: "动爻", icon: GitCommitHorizontal },
  { id: "changed", label: "变卦", icon: GitMerge },
] as const;

function BaguaRitual({ items, reduced }: { items: ChatRitualItem[]; reduced: boolean }) {
  const stages = items.filter((item): item is Extract<ChatRitualItem, { kind: "bagua_stage" }> => item.kind === "bagua_stage");

  return (
    <div className="grid grid-cols-3 gap-2" aria-label="八卦卦象展开">
      {baguaStages.map((stage, index) => {
        const value = stages.find((item) => item.stage === stage.id);
        const Icon = stage.icon;

        return (
          <motion.div
            key={stage.id}
            initial={{ opacity: 0.35, y: reduced ? 0 : 8 }}
            animate={{ opacity: value ? 1 : 0.35, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26, delay: reduced ? 0 : index * 0.05 }}
            className={`min-w-0 border-t px-1 py-3 sm:px-3 ${value ? "border-[#79b8b1]/55" : "border-[#33342d]"}`}
          >
            <Icon size={16} className={value ? "text-[#79b8b1]" : "text-[#555149]"} aria-hidden="true" />
            <p className="mt-2 text-[10px] text-[#777168]">{stage.label}</p>
            <p className="mt-1 break-words text-xs font-medium leading-5 text-[#d8d0c3] sm:text-sm">{value?.title.replace(`${stage.label} · `, "") ?? "待显现"}</p>
            <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#706a61] sm:text-[10px]">{value?.detail}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

function BaziRitual({ items, reduced }: { items: ChatRitualItem[]; reduced: boolean }) {
  const pillars = items.find((item): item is Extract<ChatRitualItem, { kind: "bazi_pillars" }> => item.kind === "bazi_pillars");
  const wuxing = items.find((item): item is Extract<ChatRitualItem, { kind: "bazi_wuxing" }> => item.kind === "bazi_wuxing");
  const max = Math.max(1, ...Object.values(wuxing?.counts ?? {}));

  return (
    <div aria-label="八字命盘展开">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: pillars?.pillars[index] ? 1 : 0.3, y: 0 }}
            transition={{ type: "spring", stiffness: 270, damping: 25, delay: reduced ? 0 : index * 0.06 }}
            className="min-w-0 border-y border-[#33342d] py-3 text-center"
          >
            <p className="text-[9px] text-[#706a61]">{["年柱", "月柱", "日柱", "时柱"][index]}</p>
            <p className="mt-1 break-words font-ritual text-sm text-[#ead9b3] sm:text-base">{pillars?.pillars[index] ?? "待排"}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {["木", "火", "土", "金", "水"].map((element) => {
          const count = wuxing?.counts[element] ?? 0;

          return (
            <div key={element} className="min-w-0 text-center">
              <div className="mx-auto h-16 w-2 overflow-hidden rounded-full bg-[#25261f]">
                <motion.div
                  className="h-full origin-bottom rounded-full bg-[#b58c4e]"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: count / max }}
                  transition={{ type: "spring", stiffness: 170, damping: 24 }}
                />
              </div>
              <p className="mt-2 text-xs text-[#b9ad99]">{element}</p>
              <p className="text-[9px] text-[#666158]">{count}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeneralRitual({ items }: { items: ChatRitualItem[] }) {
  const signal = items.find((item): item is Extract<ChatRitualItem, { kind: "general_signal" }> => item.kind === "general_signal");

  return signal ? (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-l-2 border-[#c9a35f]/55 py-1 pl-4">
      <p className="text-xs font-medium text-[#d8c7a5]">{signal.title}</p>
      <p className="mt-1 text-xs leading-6 text-[#777168]">{signal.detail}</p>
    </motion.div>
  ) : null;
}

export function ChatRitual({
  progress,
  intent,
  loading,
}: {
  progress: ChatProgressData[];
  intent: ChatIntent | null;
  loading: boolean;
}) {
  const reduced = Boolean(useReducedMotion());
  const items = latestRitualItems(progress);
  const currentIntent = progress.findLast((event) => event.intent)?.intent ?? intent ?? "general";
  const latestByStep = new Map(progress.map((event) => [event.step, event]));

  return (
    <section className="mb-6 border-y border-[#282923] py-4" aria-live="polite">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-[#c9a35f]" aria-hidden="true" />
        <p className="text-xs font-medium text-[#cfc6b8]">{loading ? "本轮问事进行中" : "本轮推演过程"}</p>
        <span className="ml-auto text-[10px] text-[#666158]">真实步骤</span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1">
        {processSteps.map((step) => {
          const event = latestByStep.get(step.id);
          const completed = event?.status === "completed";
          const running = event?.status === "running";

          return (
            <div key={step.id} className="min-w-0">
              <div className={`h-px ${completed ? "bg-[#79b8b1]" : running ? "bg-[#c9a35f]" : "bg-[#34352e]"}`} />
              <div className="mt-2 flex items-center gap-1">
                {completed ? (
                  <BadgeCheck size={11} className="shrink-0 text-[#79b8b1]" aria-hidden="true" />
                ) : (
                  <CircleDashed size={11} className={`shrink-0 ${running ? "animate-spin text-[#c9a35f]" : "text-[#4f4c45]"}`} aria-hidden="true" />
                )}
                <span className={`truncate text-[9px] sm:text-[10px] ${event ? "text-[#a59d91]" : "text-[#555149]"}`}>
                  {event?.label ?? step.fallback}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 || currentIntent === "tarot" || currentIntent === "bagua" || currentIntent === "bazi" ? (
        <div className="mt-5">
          {currentIntent === "tarot" ? <TarotRitual items={items} reduced={reduced} /> : null}
          {currentIntent === "bagua" ? <BaguaRitual items={items} reduced={reduced} /> : null}
          {currentIntent === "bazi" ? <BaziRitual items={items} reduced={reduced} /> : null}
          {currentIntent === "general" || currentIntent === "palm" ? <GeneralRitual items={items} /> : null}
        </div>
      ) : null}
    </section>
  );
}

export function ChatConclusionCard({
  conclusion,
  serviceMode,
  answerShape,
  answerStatus,
  onFollowUp,
}: {
  conclusion: ChatConclusion;
  serviceMode: ChatServiceMode;
  answerShape?: ChatAnswerShape;
  answerStatus?: FortuneAnswer["status"];
  onFollowUp: (question: string) => void;
}) {
  const mode = getChatServiceMode(serviceMode);
  const modeLabel = answerShape === "safety_boundary"
    ? "安全提示"
    : answerShape === "missing_info"
      ? "待补资料"
      : mode.label;
  const canGenerateDeepReport = answerShape !== "safety_boundary" &&
    answerShape !== "missing_info" &&
    answerShape !== "identity_boundary" &&
    answerStatus !== "blocked" &&
    answerStatus !== "needs_input";

  return (
    <section className="mt-7 rounded-lg border border-[#3a3529] bg-[#11110e] p-4 sm:p-5" aria-label="本轮结论卡">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#e0bd70]">
          <BadgeCheck size={14} aria-hidden="true" />
          本轮结论
        </p>
        <span className="text-[10px] text-[#6f685f]">{modeLabel}</span>
      </div>
      <p className="mt-3 text-base font-semibold leading-7 text-[#f1e8d8]">{conclusion.verdict}</p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-medium text-[#777168]">为什么</p>
          <ol className="mt-2 space-y-2">
            {conclusion.reasons.map((reason, index) => (
              <li key={`${reason}-${index}`} className="flex gap-2 text-xs leading-6 text-[#bdb4a6]">
                <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-[#24231c] text-[9px] text-[#c9a35f]">{index + 1}</span>
                <span>{reason}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="space-y-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-[#b87a68]">
              <ShieldAlert size={12} aria-hidden="true" /> 最大风险
            </p>
            <p className="mt-2 text-xs leading-6 text-[#bda69f]">{conclusion.risk}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[#6fae9e]">下一步</p>
            <p className="mt-2 text-xs leading-6 text-[#adc8bf]">{conclusion.nextStep}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-[#292a24] pt-4">
        <p className="text-[10px] text-[#706a61]">继续追问</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {conclusion.followUps.slice(0, 3).map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onFollowUp(question)}
              className="group flex min-h-11 items-center justify-between gap-2 rounded-md border border-[#2e3029] px-3 py-2 text-left text-xs leading-5 text-[#aaa294] transition hover:border-[#c9a35f]/40 hover:bg-[#171713] hover:text-[#e4dac9]"
            >
              <span>{question}</span>
              <ArrowRight size={13} className="shrink-0 text-[#676158] transition group-hover:translate-x-0.5 group-hover:text-[#c9a35f]" aria-hidden="true" />
            </button>
          ))}
        </div>
        {canGenerateDeepReport ? (
          <Link
            href="/reports/deep"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md px-2 text-xs font-medium text-[#d8b873] transition hover:bg-[#c9a35f]/8 hover:text-[#f0d49a]"
          >
            <FileText size={14} aria-hidden="true" />
            生成深度报告
          </Link>
        ) : null}
      </div>
    </section>
  );
}
