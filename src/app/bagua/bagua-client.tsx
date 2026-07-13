"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Coins, Hexagon, Loader2 } from "lucide-react";
import { getStarCostLabel } from "@/lib/commerce";

type Trigram = {
  name: string;
  symbol: string;
  element: string;
  image: string;
  advice: string;
};

type Hexagram = {
  name: string;
  upper: Trigram;
  lower: Trigram;
  relation: string;
  relationAdvice: string;
};

type BaguaChart = {
  topic: string;
  lines: number[];
  movingLine: number;
  moving: {
    position: string;
    advice: string;
  };
  mainHexagram: Hexagram;
  changedHexagram: Hexagram;
};

type BaguaReport = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

type BaguaResult = {
  steps: string[];
  cost: number;
  balanceAfter: number;
  chart: BaguaChart;
  report: BaguaReport;
};

function LineView({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-center gap-2">
      {active ? (
        <span className="h-2 w-full rounded-full bg-[#f0d49a]" />
      ) : (
        <>
          <span className="h-2 w-full rounded-full bg-[#f0d49a]" />
          <span className="h-2 w-full rounded-full bg-[#f0d49a]" />
        </>
      )}
    </div>
  );
}

export function BaguaClient({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [question, setQuestion] = useState("我是否应该在三个月内换工作？");
  const [timeframe, setTimeframe] = useState("未来三个月");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(`本次消耗 ${getStarCostLabel("bagua_question")}。`);
  const [result, setResult] = useState<BaguaResult | null>(null);

  async function ask() {
    setLoading(true);
    setResult(null);
    setMessage("正在起卦并识别动爻...");

    const response = await fetch("/api/fortune/bagua", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, timeframe }),
    });
    const data = (await response.json()) as
      | ({ ok: true } & BaguaResult)
      | { ok: false; message?: string; balance?: number };

    setLoading(false);

    if (!response.ok || data.ok === false) {
      const failure = data as { ok: false; message?: string; balance?: number };
      setMessage(failure.message ?? "八卦问事失败。");
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
    <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#2f261a] pb-5">
          <div>
            <p className="text-sm text-[#b9ad99]">当前星力</p>
            <p className="font-ritual text-4xl text-[#fff7e8]">{balance}</p>
          </div>
          <Coins className="text-[#c8a15a]" size={30} aria-hidden="true" />
        </div>

        <label className="mt-5 block">
          <span className="text-sm text-[#d8cab2]">要问的事情</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={5}
            className="mt-2 w-full resize-none rounded-md border border-[#3a3023] bg-[#080705] px-4 py-3 text-[#fff7e8] outline-none transition focus:border-[#c8a15a]"
          />
        </label>

        <label className="mt-5 block">
          <span className="text-sm text-[#d8cab2]">观察时间</span>
          <input
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value)}
            className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition focus:border-[#c8a15a]"
          />
        </label>

        <button
          type="button"
          onClick={ask}
          disabled={loading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-5 font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : (
            <Hexagon size={18} aria-hidden="true" />
          )}
          {loading ? "起卦中..." : "开始八卦问事"}
        </button>
        <p className="mt-3 text-sm text-[#b9ad99]">{message}</p>
      </section>

      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <p className="text-sm font-semibold text-[#c8a15a]">问事过程</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {(result?.steps ?? ["确定问事主题", "生成六爻卦象", "识别动爻变卦", "生成问事建议"]).map(
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
            <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="rounded-lg border border-[#4a3a25] bg-[#080705] p-5">
                <p className="text-sm text-[#b9ad99]">六爻</p>
                <div className="mt-4 flex flex-col-reverse gap-3">
                  {result.chart.lines.map((line, index) => (
                    <div key={`${line}-${index}`} className="flex items-center gap-3">
                      <span className="w-10 text-xs text-[#b9ad99]">{index + 1}爻</span>
                      <LineView active={line === 1} />
                      {result.chart.movingLine === index + 1 ? (
                        <span className="rounded-md bg-[#c8a15a] px-2 py-1 text-xs font-semibold text-[#130f09]">
                          动
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[result.chart.mainHexagram, result.chart.changedHexagram].map((hexagram, index) => (
                  <article
                    key={`${hexagram.name}-${index}`}
                    className="rounded-lg border border-[#3a3023] bg-[#080705] p-5"
                  >
                    <p className="text-sm text-[#b9ad99]">{index === 0 ? "本卦" : "变卦"}</p>
                    <h3 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                      {hexagram.name}
                    </h3>
                    <p className="mt-3 text-sm text-[#f0d49a]">
                      {hexagram.upper.symbol} {hexagram.upper.name} / {hexagram.lower.symbol} {hexagram.lower.name}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-[#d8cab2]">
                      {hexagram.relationAdvice}
                    </p>
                  </article>
                ))}
              </div>
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
            八卦问事结果会在这里生成，并同步保存到报告中心。
          </div>
        )}
      </section>
    </div>
  );
}
