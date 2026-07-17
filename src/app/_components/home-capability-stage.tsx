"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Bot,
  BrainCircuit,
  Camera,
  Hexagon,
  ScrollText,
  Sparkles,
} from "lucide-react";

type CapabilityId = "chat" | "tarot" | "bazi" | "bagua" | "palm" | "report";

const capabilities = [
  {
    id: "chat" as const,
    label: "AI 对话",
    title: "直接问，不用先选工具",
    description: "系统理解问题后，自动决定是否调用塔罗、八字、八卦或报告能力。",
    Icon: Bot,
  },
  {
    id: "tarot" as const,
    label: "塔罗",
    title: "让牌阵承接当下的具体困惑",
    description: "从单牌、关系和事业到凯尔特十字，牌面、位置和问题会一起进入 AI 推演。",
    Icon: Sparkles,
  },
  {
    id: "bazi" as const,
    label: "八字命盘",
    title: "一次起盘，长期复用",
    description: "生辰信息形成四柱十神、大运流年和喜忌结构，之后的每次提问都可以读取命盘摘要。",
    Icon: BrainCircuit,
  },
  {
    id: "bagua" as const,
    label: "八卦问事",
    title: "为一个具体选择生成卦象",
    description: "本卦、动爻、变卦、互卦、错卦和综卦逐步生成，适合判断节奏与行动窗口。",
    Icon: Hexagon,
  },
  {
    id: "palm" as const,
    label: "手相分析",
    title: "上传照片，进入视觉分析链路",
    description: "先校验图片质量与授权，再识别掌纹，结果继续沉淀到个人档案。",
    Icon: Camera,
  },
  {
    id: "report" as const,
    label: "深度报告",
    title: "把一次回答变成可回看的计划",
    description: "汇总档案、近期问题和推演结果，生成可以保存、分享和继续追问的报告。",
    Icon: ScrollText,
  },
] as const;

function ChatVisual() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-[#282923] px-4 py-3 text-sm text-[#e5ddcf]">
        我应该接受这个新机会吗？
      </div>
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#c9a35f]/35 text-[#efd9a6]">
          <Sparkles size={14} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="rounded-xl border border-[#2c7b78]/30 bg-[#2c7b78]/8 px-3 py-2 text-xs text-[#79b8b1]">
            已读取档案 · 自动调用八卦问事
          </div>
          <p className="text-sm leading-7 text-[#c8c0b2]">
            这次机会值得推进，但重点是先谈清边界。卦象更支持“带条件地接受”，而不是无保留投入。
          </p>
        </div>
      </div>
    </div>
  );
}

function TarotVisual({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 sm:gap-5">
      {["现状", "阻力", "趋向"].map((label, index) => (
        <motion.div
          key={label}
          className="flex aspect-[0.62] w-[27%] max-w-[130px] flex-col items-center justify-between rounded-2xl border border-[#c9a35f]/35 bg-[#11120f] p-3 shadow-2xl"
          initial={{ opacity: 0, rotateY: reduceMotion ? 0 : 90, y: reduceMotion ? 0 : 18 }}
          animate={{ opacity: 1, rotateY: 0, y: index === 1 && !reduceMotion ? -10 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, delay: index * 0.12 }}
        >
          <span className="text-[10px] tracking-[0.24em] text-[#80796e]">{label}</span>
          <span className="flex size-12 items-center justify-center rounded-full border border-[#c9a35f]/25 text-[#efd9a6]">
            <Sparkles size={20} strokeWidth={1.2} aria-hidden="true" />
          </span>
          <span className="font-ritual text-sm text-[#d8c9aa]">第 {index + 1} 张</span>
        </motion.div>
      ))}
    </div>
  );
}

function BaziVisual({ reduceMotion }: { reduceMotion: boolean }) {
  const elements = [
    ["木", "#568b68", 0],
    ["火", "#b84b37", 72],
    ["土", "#b48a54", 144],
    ["金", "#c6b98f", 216],
    ["水", "#397e88", 288],
  ] as const;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[330px]">
      <div className="absolute inset-[12%] rounded-full border border-[#c9a35f]/20" />
      <div className="absolute inset-[28%] flex items-center justify-center rounded-full border border-[#323128] bg-[#11120f] text-center">
        <div>
          <p className="text-[10px] tracking-[0.28em] text-[#80796e]">五行摘要</p>
          <p className="mt-2 font-ritual text-2xl text-[#efd9a6]">木旺 · 金弱</p>
        </div>
      </div>
      {elements.map(([label, color, angle], index) => (
        <div
          key={label}
          className="absolute left-1/2 top-1/2 size-12"
          style={{
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-132px) rotate(-${angle}deg)`,
          }}
        >
          <motion.div
            className="flex size-full items-center justify-center rounded-full border bg-[#0d0e0c] font-ritual text-lg"
            style={{ color, borderColor: `${color}66` }}
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, delay: index * 0.08 }}
          >
            {label}
          </motion.div>
        </div>
      ))}
    </div>
  );
}

function BaguaVisual({ reduceMotion }: { reduceMotion: boolean }) {
  const lines = [true, false, false, true, true, false];

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col-reverse gap-4 py-4">
      {lines.map((solid, index) => (
        <motion.div
          key={`${solid}-${index}`}
          className="flex h-3 items-center justify-center gap-5"
          initial={{ opacity: 0, scaleX: reduceMotion ? 1 : 0.2 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, delay: index * 0.11 }}
        >
          {solid ? (
            <span className="h-[7px] w-[78%] rounded-full bg-[#c9a35f] shadow-[0_0_22px_rgba(201,163,95,0.25)]" />
          ) : (
            <>
              <span className="h-[7px] w-[34%] rounded-full bg-[#79b8b1]" />
              <span className="h-[7px] w-[34%] rounded-full bg-[#79b8b1]" />
            </>
          )}
        </motion.div>
      ))}
      <div className="mb-3 text-center">
        <p className="text-xs tracking-[0.28em] text-[#80796e]">本卦 · 风火家人</p>
      </div>
    </div>
  );
}

function PalmVisual() {
  return (
    <div className="relative mx-auto flex h-[290px] w-full max-w-sm items-center justify-center overflow-hidden rounded-[28px] border border-[#2a2b25] bg-[#0a0b09]">
      <Camera size={118} strokeWidth={0.55} className="text-[#5b5a50]" aria-hidden="true" />
      <div className="xuanji-scan-line absolute left-[12%] right-[12%] top-1/2 h-px bg-[#79b8b1] shadow-[0_0_18px_3px_rgba(121,184,177,0.38)]" />
      <span className="absolute left-5 top-5 text-[10px] tracking-[0.26em] text-[#79b8b1]">PALM SCAN</span>
      <span className="absolute bottom-5 right-5 rounded-full border border-[#2c7b78]/35 bg-[#2c7b78]/10 px-3 py-1 text-xs text-[#79b8b1]">
        掌纹清晰度 92%
      </span>
    </div>
  );
}

function ReportVisual({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      className="mx-auto w-full max-w-sm rounded-[24px] border border-[#c9a35f]/30 bg-[#f0e8d7] p-6 text-[#24211b] shadow-[0_28px_80px_rgba(0,0,0,0.38)]"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.5 }}
    >
      <div className="flex items-center justify-between border-b border-[#756a55]/25 pb-4">
        <div>
          <p className="text-[10px] tracking-[0.22em] text-[#756a55]">XUANJI REPORT</p>
          <p className="mt-1 font-ritual text-xl">事业选择 · 90 天推演</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-full border border-[#756a55]/25">玄</span>
      </div>
      <div className="mt-5 space-y-3">
        {["当前局势", "关键变量", "行动窗口", "风险提醒"].map((item, index) => (
          <div key={item} className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-[#8a7a5d]">0{index + 1}</span>
            <span className="text-sm">{item}</span>
            <motion.span
              className="ml-auto h-px w-[38%] origin-left bg-[#8a7a5d]/35"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.6, delay: index * 0.1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-xl bg-[#2c7b78]/10 px-4 py-3 text-xs leading-6 text-[#3d625e]">
        建议先用两周完成一次低成本验证，再决定是否全面转向。
      </div>
    </motion.div>
  );
}

function CapabilityVisual({ id, reduceMotion }: { id: CapabilityId; reduceMotion: boolean }) {
  if (id === "tarot") {
    return <TarotVisual reduceMotion={reduceMotion} />;
  }

  if (id === "bazi") {
    return <BaziVisual reduceMotion={reduceMotion} />;
  }

  if (id === "bagua") {
    return <BaguaVisual reduceMotion={reduceMotion} />;
  }

  if (id === "palm") {
    return <PalmVisual />;
  }

  if (id === "report") {
    return <ReportVisual reduceMotion={reduceMotion} />;
  }

  return <ChatVisual />;
}

export function HomeCapabilityStage() {
  const [activeId, setActiveId] = useState<CapabilityId>("chat");
  const reduceMotion = Boolean(useReducedMotion());
  const activeCapability = capabilities.find((item) => item.id === activeId) ?? capabilities[0];

  return (
    <div className="grid overflow-hidden rounded-[30px] border border-[#323128] bg-[#0d0e0c] shadow-[0_35px_120px_rgba(0,0,0,0.4)] lg:grid-cols-[0.68fr_1.32fr]">
      <div className="border-b border-[#24251f] p-3 sm:p-5 lg:border-b-0 lg:border-r">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1" role="tablist" aria-label="玄机 AI 能力">
          {capabilities.map((item) => {
            const Icon = item.Icon;
            const active = item.id === activeId;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveId(item.id)}
                className={`relative flex min-w-fit items-center gap-3 rounded-2xl px-4 py-3 text-left transition lg:w-full ${
                  active ? "text-[#f4efe5]" : "text-[#8f887b] hover:text-[#d5cdbf]"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="capability-active"
                    className="absolute inset-0 rounded-2xl border border-[#c9a35f]/20 bg-[#c9a35f]/8"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 flex size-8 items-center justify-center rounded-full border border-current/20">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="relative z-10 text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-[540px] overflow-hidden p-6 sm:p-9 lg:p-12">
        <div className="absolute inset-0 xuanji-grid opacity-30" />
        <div className="relative flex h-full min-h-[460px] flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeCapability.id}-copy`}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28 }}
            >
              <p className="text-xs tracking-[0.24em] text-[#c9a35f]">{activeCapability.label}</p>
              <h3 className="mt-3 max-w-xl font-ritual text-2xl leading-tight text-[#f4efe5] sm:text-3xl">
                {activeCapability.title}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#aaa294]">
                {activeCapability.description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex min-h-0 flex-1 items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCapability.id}
                className="w-full"
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
                transition={{ duration: reduceMotion ? 0 : 0.32 }}
              >
                <CapabilityVisual id={activeCapability.id} reduceMotion={reduceMotion} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
