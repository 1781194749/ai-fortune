"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp, FileText, Sparkles, UserRound } from "lucide-react";

const panelMotion = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

export function HomeConversionPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mx-auto mt-12 max-w-5xl pb-8 pt-3 lg:pb-16">
      <div className="absolute left-[14%] right-[14%] top-1/2 h-px bg-gradient-to-r from-transparent via-[#c9a35f]/30 to-transparent" />
      <motion.div
        className="relative grid gap-4 lg:grid-cols-[0.9fr_1.2fr_0.9fr] lg:items-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        transition={{ staggerChildren: reduceMotion ? 0 : 0.12 }}
      >
        <motion.div
          variants={panelMotion}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
          className="rounded-[24px] border border-[#323128] bg-[#11120f] p-5 shadow-2xl lg:-rotate-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full border border-[#c9a35f]/30 text-[#efd9a6]">
              <UserRound size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] tracking-[0.2em] text-[#80796e]">命理档案</p>
              <p className="mt-1 text-sm text-[#e8dfd1]">林一 · 产品经理</p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-xs">
            <div className="flex justify-between border-b border-[#24251f] pb-3 text-[#aaa294]">
              <span>生辰</span>
              <span className="text-[#d9cfbe]">1994.08.18 · 巳时</span>
            </div>
            <div className="flex justify-between border-b border-[#24251f] pb-3 text-[#aaa294]">
              <span>五行</span>
              <span className="text-[#79b8b1]">木旺 · 金弱</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {["事业", "选择", "年度运势"].map((item) => (
                <span key={item} className="rounded-full border border-[#323128] px-2.5 py-1 text-[#aaa294]">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={panelMotion}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
          className="relative z-10 rounded-[28px] border border-[#c9a35f]/30 bg-[#0d0e0c] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.5)] sm:p-6"
        >
          <div className="flex items-center justify-between border-b border-[#24251f] pb-4">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-full border border-[#c9a35f]/30 text-[#efd9a6]">
                <Sparkles size={14} aria-hidden="true" />
              </span>
              <span className="text-sm text-[#e8dfd1]">玄机 AI</span>
            </div>
            <span className="text-[10px] text-[#6f6a60]">已读取档案</span>
          </div>
          <div className="space-y-5 py-6">
            <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-[#282923] px-4 py-3 text-sm leading-6 text-[#e8dfd1]">
              我应该留在现在的团队，还是接受新机会？
            </div>
            <div className="flex gap-3">
              <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#c9a35f]/10 text-[#efd9a6]">
                <Sparkles size={13} aria-hidden="true" />
              </span>
              <div className="space-y-3 text-sm leading-7 text-[#bdb5a7]">
                <p>我先结合你的事业关注和近期对话看，再为这个选择起一卦。</p>
                <div className="rounded-xl border border-[#2c7b78]/25 bg-[#2c7b78]/8 px-3 py-2 text-xs text-[#79b8b1]">
                  推演完成 · 本卦与行动窗口已生成
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3 rounded-2xl border border-[#323128] bg-[#11120f] p-3">
            <span className="flex-1 text-sm text-[#777168]">继续追问...</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-[#c9a35f] text-[#17130d]">
              <ArrowUp size={15} aria-hidden="true" />
            </span>
          </div>
        </motion.div>

        <motion.div
          variants={panelMotion}
          transition={{ duration: reduceMotion ? 0 : 0.45 }}
          className="rounded-[24px] border border-[#c9a35f]/20 bg-[#ece3d1] p-5 text-[#28231b] shadow-2xl lg:rotate-2"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.2em] text-[#7d705b]">深度报告</p>
              <p className="mt-1 font-ritual text-lg">事业选择推演</p>
            </div>
            <FileText size={19} className="text-[#7d705b]" aria-hidden="true" />
          </div>
          <div className="mt-5 space-y-4">
            {[82, 64, 73].map((width, index) => (
              <div key={width}>
                <div className="flex items-center justify-between text-[10px] text-[#7d705b]">
                  <span>{["机会匹配", "转换成本", "未来空间"][index]}</span>
                  <span>{width}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#cabda7]/45">
                  <motion.div
                    className="h-full rounded-full bg-[#8b7753]"
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: width / 100 }}
                    viewport={{ once: true }}
                    style={{ transformOrigin: "left" }}
                    transition={{ duration: reduceMotion ? 0 : 0.7, delay: index * 0.1 }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-[#cabda7]/55 pt-4 text-xs leading-6 text-[#625846]">
            结论不是替你决定，而是让关键变量和下一步行动变得清楚。
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
