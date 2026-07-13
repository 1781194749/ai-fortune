"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { getStarCostLabel } from "@/lib/commerce";
import type { TarotSpread } from "@/lib/tarot";

type TarotCardResult = {
  position: string;
  card: string;
  orientation: string;
  meaning: string;
  advice: string;
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
    detail: "你的心意、对方状态、关系走向",
  },
] as const;

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

  async function draw() {
    setLoading(true);
    setResult(null);
    setMessage("正在洗牌并生成牌阵...");

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
      setMessage(failure.message ?? "塔罗推演失败。");
      if (typeof failure.balance === "number") {
        setBalance(failure.balance);
      }
      return;
    }

    setResult(data);
    setBalance(data.balanceAfter);
    setMessage(`本次消耗 ${data.cost} 星力，剩余 ${data.balanceAfter} 星力。`);
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

      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <p className="text-sm font-semibold text-[#c8a15a]">推演过程</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {(result?.steps ?? ["识别问题类型", "洗牌并抽取牌阵", "解释牌面象征", "生成专属解读"]).map(
            (step, index) => (
              <div
                key={step}
                className="rounded-md border border-[#2f261a] bg-[#080705] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-[#c8a15a]/12 text-sm text-[#f0d49a]">
                    {index + 1}
                  </span>
                  {result ? (
                    <BadgeCheck className="text-[#3c8b72]" size={17} aria-hidden="true" />
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-[#d8cab2]">{step}</p>
              </div>
            ),
          )}
        </div>

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {result.cards.map((card) => (
                <article
                  key={`${card.position}-${card.card}`}
                  className="rounded-lg border border-[#4a3a25] bg-[#0b0906] p-4"
                >
                  <p className="text-sm text-[#b9ad99]">{card.position}</p>
                  <h3 className="mt-3 font-ritual text-3xl text-[#fff7e8]">
                    {card.card}
                  </h3>
                  <p className="mt-1 text-sm text-[#f0d49a]">{card.orientation}</p>
                  <p className="mt-4 text-sm leading-7 text-[#d8cab2]">
                    {card.meaning}
                  </p>
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
      </section>
    </div>
  );
}
