"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  QuestionProcessPanel,
  type QuestionProcessState,
} from "@/app/_components/question-process-panel";
import { getStarCostLabel } from "@/lib/commerce";
import type { TarotSpread } from "@/lib/tarot";

type TarotCardResult = {
  position: string;
  positionMeaning: string;
  card: string;
  orientation: string;
  meaning: string;
  contextMeaning: string;
  advice: string;
  keywords: string[];
  arcana: "major" | "minor";
  suit?: "wands" | "cups" | "swords" | "pentacles";
  element?: string;
  visual: {
    code: string;
    symbol: string;
    tone: "spirit" | "fire" | "water" | "air" | "earth";
  };
};

type TarotReport = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

type TarotResult = {
  steps: string[];
  cost: number;
  balanceAfter: number;
  report: TarotReport;
  cards: TarotCardResult[];
  recommendation?: string;
};

const spreads = [
  {
    code: "daily",
    title: "今日单牌",
    feature: "tarot_daily",
    detail: "每日 1 次免费灵感和行动提醒",
  },
  {
    code: "three_card",
    title: "三牌阵",
    feature: "tarot_three_card",
    detail: "过去、现在、未来",
  },
  {
    code: "love",
    title: "爱情牌阵",
    feature: "tarot_love",
    detail: "心意、对方、阻力、走向、行动",
  },
  {
    code: "decision",
    title: "二选一牌阵",
    feature: "tarot_three_card",
    detail: "A/B 方案、关键变量、建议动作",
  },
  {
    code: "career",
    title: "事业牌阵",
    feature: "tarot_three_card",
    detail: "状态、机会、能力、风险、下一步",
  },
  {
    code: "celtic_cross",
    title: "凯尔特十字",
    feature: "tarot_love",
    detail: "复杂问题的十张牌深度拆解",
  },
] as const;

const tarotProcessSteps = [
  { label: "识别问题类型", detail: "确认这次更适合日签、关系、事业、选择或深度牌阵。" },
  { label: "洗牌并抽取牌阵", detail: "从完整 78 张牌库中抽取不重复牌面与位置关系。" },
  { label: "解释牌面象征", detail: "结合正逆位、牌位、主题和关键词解释含义。" },
  { label: "生成专属解读", detail: "形成综合结论、风险提醒与下一步可追问方向。" },
] as const;

function visualToneClass(tone: TarotCardResult["visual"]["tone"]) {
  if (tone === "fire") return "border-[#ba5c39] bg-[#2a140d] text-[#f1b083]";
  if (tone === "water") return "border-[#4f91a8] bg-[#101f29] text-[#a9d6e7]";
  if (tone === "air") return "border-[#9aa3b5] bg-[#171b24] text-[#d9deea]";
  if (tone === "earth") return "border-[#7f8f59] bg-[#171d12] text-[#d4df9c]";
  return "border-[#c8a15a] bg-[#1b1610] text-[#f0d49a]";
}

function arcanaLabel(card: TarotCardResult) {
  if (card.arcana === "major") return "大阿卡那";

  return card.element ? `${card.element}元素` : "小阿卡那";
}

export function TarotClient({
  initialBalance,
  initialSpread = "three_card",
}: {
  initialBalance: number;
  initialSpread?: TarotSpread;
}) {
  const [spread, setSpread] = useState<TarotSpread>(initialSpread);
  const [question, setQuestion] = useState("我和对方接下来会如何发展？");
  const [balance, setBalance] = useState(initialBalance);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("选择牌阵后开始推演。");
  const [result, setResult] = useState<TarotResult | null>(null);
  const [processState, setProcessState] = useState<QuestionProcessState>("idle");
  const selectedSpread = spreads.find((item) => item.code === spread) ?? spreads[1];

  async function draw() {
    setLoading(true);
    setResult(null);
    setProcessState("running");
    setMessage("已开始塔罗问事，正在按流程洗牌、抽牌和解读。");

    const response = await fetch("/api/fortune/tarot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spread, question }),
    });
    const data = (await response.json()) as
      | ({ ok: true } & TarotResult)
      | { ok: false; message?: string; balance?: number };

    setLoading(false);

    if (!response.ok || data.ok === false) {
      const failure = data as { ok: false; message?: string; balance?: number };
      setProcessState("error");
      setMessage(failure.message ?? "塔罗推演没有完成，本次不会生成报告。");
      if (typeof failure.balance === "number") {
        setBalance(failure.balance);
      }
      return;
    }

    setResult(data);
    setProcessState("success");
    setBalance(data.balanceAfter);
    setMessage(`塔罗问事已完成，本次服务消耗 ${data.cost} 星力，剩余 ${data.balanceAfter} 星力。`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#2f261a] pb-5">
          <div>
            <p className="text-sm text-[#b9ad99]">当前星力</p>
            <p className="font-ritual text-4xl text-[#fff7e8]">{balance}</p>
          </div>
          <Sparkles className="text-[#c8a15a]" size={30} aria-hidden="true" />
        </div>

        <div className="mt-5 grid gap-3">
          {spreads.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setSpread(item.code)}
              className={`rounded-lg border p-4 text-left transition ${
                spread === item.code
                  ? "border-[#c8a15a] bg-[#c8a15a]/12"
                  : "border-[#3a3023] bg-[#080705] hover:border-[#6a5431]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-ritual text-2xl text-[#fff7e8]">
                  {item.title}
                </span>
                <span className="rounded-md bg-[#1c1711] px-2 py-1 text-xs text-[#f0d49a]">
                  {getStarCostLabel(item.feature)}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#b9ad99]">{item.detail}</p>
            </button>
          ))}
        </div>

        <label className="mt-5 block">
          <span className="text-sm text-[#d8cab2]">问题</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-none rounded-md border border-[#3a3023] bg-[#080705] px-4 py-3 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
          />
        </label>

        <button
          type="button"
          onClick={draw}
          disabled={loading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-5 font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )}
          {loading ? "推演中..." : "开始塔罗推演"}
        </button>
        <p className="mt-3 text-sm text-[#b9ad99]">{message}</p>
      </section>

      <div>
        <QuestionProcessPanel
          title="推演过程"
          service={{
            type: selectedSpread.title,
            method: selectedSpread.detail,
            cost: getStarCostLabel(selectedSpread.feature),
            output: "结论卡 + 可回看的报告",
          }}
          steps={tarotProcessSteps}
          state={processState}
          completedSteps={result?.steps}
          resultTitle={result?.report.title}
          resultSummary={result?.report.summary}
          nextActions={["继续追问牌面细节", "查看完整报告", "把结论带回 Chat 跟进"]}
          errorMessage={processState === "error" ? message : undefined}
          onRetry={loading ? undefined : () => void draw()}
        />

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {result.cards.map((card) => (
                <article
                  key={`${card.position}-${card.card}`}
                  className="grid min-h-[292px] gap-4 rounded-lg border border-[#4a3a25] bg-[#0b0906] p-4 sm:grid-cols-[104px_1fr]"
                >
                  <div className={`flex aspect-[3/4] min-h-[136px] flex-col justify-between rounded-md border p-3 ${visualToneClass(card.visual.tone)}`}>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>{card.visual.code}</span>
                      <span>{card.visual.symbol}</span>
                    </div>
                    <div className="text-center">
                      <p className="font-ritual text-4xl">{card.visual.symbol}</p>
                      <p className="mt-1 text-[10px]">{arcanaLabel(card)}</p>
                    </div>
                    <div className="text-right text-[10px]">{card.orientation}</div>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm text-[#b9ad99]">{card.position}</p>
                    <h3 className="mt-2 break-words font-ritual text-3xl text-[#fff7e8]">
                      {card.card}
                    </h3>
                    <p className="mt-1 text-sm text-[#f0d49a]">{card.orientation}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {card.keywords.slice(0, 4).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-sm border border-[#3a3023] px-2 py-0.5 text-[11px] text-[#b9ad99]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[#d8cab2]">
                      {card.meaning}
                    </p>
                    <p className="mt-3 text-xs leading-6 text-[#b9ad99]">
                      {card.contextMeaning}
                    </p>
                    <p className="mt-3 border-t border-[#2f261a] pt-3 text-xs leading-6 text-[#f0d49a]">
                      {card.advice}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
              <p className="text-sm text-[#b9ad99]">报告编号：{result.report.id}</p>
              <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                {result.report.title}
              </h2>
              <div className="mt-4 whitespace-pre-line text-sm leading-8 text-[#d8cab2]">
                {result.report.content}
              </div>
              {spread === "decision" && result.recommendation ? (
                <p className="mt-4 rounded-md border border-[#c8a15a]/35 bg-[#c8a15a]/8 p-3 text-sm leading-6 text-[#f0d49a]">
                  {result.recommendation}
                </p>
              ) : null}
              <Link
                href={`/reports/${result.report.id}`}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-[#6a5431] px-4 text-sm font-semibold text-[#fff7e8] transition hover:border-[#c8a15a]"
              >
                查看完整报告
              </Link>
            </article>
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-[#2f261a] bg-[#080705] p-5 text-sm leading-7 text-[#b9ad99]">
            结果会在这里生成，并同步保存到报告中心。
          </div>
        )}
      </div>
    </div>
  );
}
