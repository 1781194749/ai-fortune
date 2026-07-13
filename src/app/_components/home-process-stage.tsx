"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { BadgeCheck, BrainCircuit, MessageCircle, ScrollText, Sparkles } from "lucide-react";

const processSteps = [
  { label: "建立档案", detail: "记住生辰与长期关注", icon: BrainCircuit },
  { label: "提出问题", detail: "直接说出真实困惑", icon: MessageCircle },
  { label: "自动起盘", detail: "选择塔罗、八字或八卦", icon: Sparkles },
  { label: "AI 解读", detail: "展示依据与判断过程", icon: BadgeCheck },
  { label: "沉淀报告", detail: "保存结论，继续追问", icon: ScrollText },
] as const;

const stageCopy = [
  "已读取：互联网行业、产品岗位，近期关注事业选择。",
  "你想知道的不是“能不能换”，而是何时换、如何降低代价。",
  "已触发事业三牌阵，并关联近期三次对话记忆。",
  "牌面显示机会正在形成，但更适合先小范围验证，而非突然中断。",
  "可以生成一份“未来 90 天事业选择报告”，持续记录进展。",
] as const;

export function HomeProcessStage() {
  const [activeStep, setActiveStep] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % processSteps.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
      <div className="relative pl-6 sm:pl-8">
        <span className="absolute bottom-5 left-[15px] top-5 w-px bg-[#323128] sm:left-[19px]" />
        <motion.span
          className="absolute left-[14px] top-5 h-[calc(100%-40px)] w-[3px] origin-top rounded-full bg-[#c9a35f] sm:left-[18px]"
          animate={{ scaleY: (activeStep + 1) / processSteps.length }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }}
        />
        <div className="space-y-2">
          {processSteps.map((step, index) => {
            const Icon = step.icon;
            const active = index === activeStep;
            const complete = index < activeStep;

            return (
              <button
                key={step.label}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`relative flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition sm:px-5 ${
                  active ? "bg-[#c9a35f]/8" : "hover:bg-white/[0.025]"
                }`}
              >
                <span
                  className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border transition ${
                    active || complete
                      ? "border-[#c9a35f]/60 bg-[#11120f] text-[#efd9a6]"
                      : "border-[#323128] bg-[#0d0e0c] text-[#6f6a60]"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span>
                  <span className={`block text-sm font-medium ${active ? "text-[#f4efe5]" : "text-[#aaa294]"}`}>
                    {step.label}
                  </span>
                  <span className="mt-1 block text-xs text-[#746f65]">{step.detail}</span>
                </span>
                <span className="ml-auto font-mono text-[10px] text-[#5f5b53]">0{index + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-[#323128] bg-[#0d0e0c] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="absolute inset-0 xuanji-grid opacity-50" />
        <div className="relative">
          <div className="flex items-center justify-between border-b border-[#24251f] pb-5">
            <div>
              <p className="text-xs tracking-[0.22em] text-[#8f887b]">XUANJI REASONING</p>
              <p className="mt-2 font-ritual text-xl text-[#f4efe5]">事业方向推演</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2c7b78]/35 bg-[#2c7b78]/10 px-3 py-1.5 text-xs text-[#79b8b1]">
              <span className="size-1.5 rounded-full bg-[#79b8b1]" />
              推演中
            </span>
          </div>

          <div className="min-h-[330px] py-8 sm:min-h-[360px]">
            <div className="ml-auto max-w-[82%] rounded-[20px] rounded-br-md bg-[#24251f] px-4 py-3 text-sm leading-7 text-[#ded6c8]">
              我最近事业有点迷茫，适合换方向吗？
            </div>

            <div className="mt-7 flex gap-3">
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#c9a35f]/35 text-[#efd9a6]">
                <Sparkles size={14} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  {processSteps.map((step, index) => (
                    <span
                      key={step.label}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        index <= activeStep
                          ? "border-[#c9a35f]/35 bg-[#c9a35f]/8 text-[#efd9a6]"
                          : "border-[#2a2b25] text-[#666158]"
                      }`}
                    >
                      {step.label}
                    </span>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                    transition={{ duration: reduceMotion ? 0 : 0.3 }}
                    className="mt-5 rounded-2xl border border-[#2a2b25] bg-[#11120f]/90 p-4"
                  >
                    <p className="text-xs font-medium text-[#c9a35f]">
                      {processSteps[activeStep].label}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[#c8c0b2]">{stageCopy[activeStep]}</p>
                    <div className="mt-4 h-px overflow-hidden bg-[#24251f]">
                      <motion.div
                        className="h-full origin-left bg-[#c9a35f]"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: reduceMotion ? 0 : 1.6, ease: "easeOut" }}
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
