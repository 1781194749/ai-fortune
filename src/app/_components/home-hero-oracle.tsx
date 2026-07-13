"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MoonStar, Sparkles, SunMedium } from "lucide-react";

const cards = [
  {
    label: "过去",
    title: "隐者",
    className: "left-[7%] top-[24%] -rotate-[11deg]",
    accent: "text-[#efd9a6]",
    Icon: MoonStar,
  },
  {
    label: "此刻",
    title: "星币二",
    className: "left-[34%] top-[13%] rotate-[2deg]",
    accent: "text-[#79b8b1]",
    Icon: Sparkles,
  },
  {
    label: "趋向",
    title: "太阳",
    className: "right-[7%] top-[26%] rotate-[12deg]",
    accent: "text-[#d6765f]",
    Icon: SunMedium,
  },
] as const;

export function HomeHeroOracle() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="relative mx-auto aspect-[0.92] w-full max-w-[560px] select-none"
      aria-label="三张塔罗牌与星盘组成的推演舞台"
      role="img"
    >
      <div className="absolute inset-[8%] rounded-full border border-[#c9a35f]/18" />
      <div className="absolute inset-[18%] rounded-full border border-dashed border-[#79b8b1]/20" />
      <motion.div
        className="absolute inset-[3%] rounded-full border border-[#c9a35f]/12"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 36, ease: "linear", repeat: Infinity }}
      >
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <span
            key={item}
            className="absolute left-1/2 top-1/2 h-[108%] w-px origin-center bg-gradient-to-b from-transparent via-[#c9a35f]/15 to-transparent"
            style={{ transform: `translate(-50%, -50%) rotate(${item * 30}deg)` }}
          />
        ))}
      </motion.div>

      <div className="absolute left-1/2 top-1/2 size-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c9a35f]/7 blur-3xl" />
      <div className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#c9a35f]/25 bg-[#0d0e0c]/80 shadow-[0_0_80px_rgba(201,163,95,0.16)]">
        <div className="absolute inset-3 rounded-full border border-dashed border-[#c9a35f]/25" />
        <div className="absolute inset-0 flex items-center justify-center font-ritual text-sm tracking-[0.35em] text-[#efd9a6]">
          玄机
        </div>
      </div>

      {cards.map(({ label, title, className, accent, Icon }, index) => (
        <motion.div
          key={title}
          className={`absolute z-10 h-[55%] w-[34%] rounded-[22px] border border-[#c9a35f]/35 bg-[#11120f]/95 p-2 shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur ${className}`}
          initial={{ opacity: 0, y: 36, rotateY: reduceMotion ? 0 : 55 }}
          animate={{ opacity: 1, y: reduceMotion ? 0 : [0, -9, 0], rotateY: 0 }}
          transition={{
            opacity: { duration: reduceMotion ? 0 : 0.7, delay: index * 0.12 },
            rotateY: { duration: reduceMotion ? 0 : 0.8, delay: index * 0.12 },
            y: {
              duration: reduceMotion ? 0 : 5.5,
              delay: index * 0.5,
              ease: "easeInOut",
              repeat: reduceMotion ? 0 : Infinity,
            },
          }}
          whileHover={reduceMotion ? undefined : { y: -14, scale: 1.025 }}
        >
          <div className="flex h-full flex-col items-center justify-between rounded-[16px] border border-[#c9a35f]/18 px-3 py-5 text-center">
            <span className="text-[10px] tracking-[0.3em] text-[#8f887b]">{label}</span>
            <div className={`flex size-16 items-center justify-center rounded-full border border-current/30 ${accent}`}>
              <Icon size={28} strokeWidth={1.2} aria-hidden="true" />
            </div>
            <div>
              <p className={`font-ritual text-xl ${accent}`}>{title}</p>
              <p className="mt-2 text-[9px] tracking-[0.22em] text-[#756f64]">XUANJI TAROT</p>
            </div>
          </div>
        </motion.div>
      ))}

      <motion.div
        className="absolute bottom-[4%] left-1/2 z-20 w-[76%] -translate-x-1/2 rounded-2xl border border-[#323128] bg-[#0d0e0c]/90 px-4 py-3 shadow-2xl backdrop-blur-xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.6, delay: 0.65 }}
      >
        <div className="flex items-center gap-3">
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2c7b78]/15 text-[#79b8b1]">
            <span className="absolute inset-0 animate-ping rounded-full border border-[#79b8b1]/25" />
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] text-[#8f887b]">AI 正在结合你的档案推演</p>
            <p className="mt-1 truncate text-sm text-[#e9e1d2]">关键不在立刻离开，而在先验证新的方向。</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
