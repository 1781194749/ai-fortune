"use client";

import Link from "next/link";
import { useState } from "react";
import { Coins, Hexagon, Loader2 } from "lucide-react";
import {
  QuestionProcessPanel,
  type QuestionProcessState,
} from "@/app/_components/question-process-panel";
import { getStarCostLabel } from "@/lib/commerce";

type Trigram = {
  name: string;
  symbol: string;
  element: string;
  image: string;
  advice: string;
};

type Hexagram = {
  number: number;
  name: string;
  nature: string;
  judgment: string;
  image: string;
  advice: string;
  topicAdvice: string;
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
    stage: string;
    yinYang: string;
    role: string;
    text: string;
    advice: string;
  };
  yao: Array<{
    index: number;
    position: string;
    stage: string;
    yinYang: string;
    active: boolean;
    moving: boolean;
    role: string;
  }>;
  mainHexagram: Hexagram;
  changedHexagram: Hexagram;
  mutualHexagram: Hexagram;
  oppositeHexagram: Hexagram;
  reversedHexagram: Hexagram;
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

const baguaProcessSteps = [
  { label: "确定问事主题", detail: "把问题压到一个明确对象和时间范围里。" },
  { label: "生成六爻卦象", detail: "形成本次问事的六爻结构。" },
  { label: "定位六十四卦", detail: "识别本卦在六十四卦中的卦名、序号和卦意。" },
  { label: "识别动爻互错综", detail: "找到变化位置，并展开互卦、错卦和综卦视角。" },
  { label: "生成问事建议", detail: "把卦象变化翻译成可执行的下一步。" },
] as const;

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
  const [processState, setProcessState] = useState<QuestionProcessState>("idle");

  async function ask() {
    setLoading(true);
    setResult(null);
    setProcessState("running");
    setMessage("已开始八卦问事，正在确定主题、起卦并识别变化线索。");

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
      setProcessState("error");
      setMessage(failure.message ?? "八卦问事没有完成，本次不会生成报告。");
      if (typeof failure.balance === "number") {
        setBalance(failure.balance);
      }
      return;
    }

    setResult(data);
    setProcessState("success");
    setBalance(data.balanceAfter);
    setMessage(`八卦问事已完成，本次服务消耗 ${data.cost} 星力，剩余 ${data.balanceAfter} 星力。`);
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

      <div>
        <QuestionProcessPanel
          title="问事过程"
          service={{
            type: "八卦问事",
            method: "明确主题 + 六爻起卦 + 动爻变卦",
            cost: getStarCostLabel("bagua_question"),
            output: "六十四卦详解 + 行动建议",
          }}
          steps={baguaProcessSteps}
          state={processState}
          completedSteps={result?.steps}
          resultTitle={result?.report.title}
          resultSummary={result?.report.summary}
          nextActions={["继续追问动爻含义", "查看完整报告", "带回 Chat 跟进变化"]}
          errorMessage={processState === "error" ? message : undefined}
          onRetry={loading ? undefined : () => void ask()}
        />

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="rounded-lg border border-[#4a3a25] bg-[#080705] p-5">
                <p className="text-sm text-[#b9ad99]">六爻</p>
                <div className="mt-4 flex flex-col-reverse gap-3">
                  {result.chart.yao.map((yao) => (
                    <div key={`${yao.position}-${yao.index}`} className="flex items-center gap-3">
                      <span className="w-10 text-xs text-[#b9ad99]">{yao.position}</span>
                      <LineView active={yao.active} />
                      {yao.moving ? (
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
                    <p className="text-sm text-[#b9ad99]">{index === 0 ? "本卦" : "变卦"} · 第 {hexagram.number} 卦</p>
                    <h3 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                      {hexagram.name}
                    </h3>
                    <p className="mt-3 text-sm text-[#f0d49a]">
                      {hexagram.upper.symbol} {hexagram.upper.name} / {hexagram.lower.symbol} {hexagram.lower.name}
                    </p>
                    <p className="mt-2 text-sm text-[#f0d49a]">{hexagram.nature}</p>
                    <p className="mt-3 text-sm leading-7 text-[#d8cab2]">
                      {hexagram.judgment}
                    </p>
                    <p className="mt-3 text-xs leading-6 text-[#b9ad99]">
                      {hexagram.topicAdvice}
                    </p>
                  </article>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <p className="text-sm text-[#b9ad99]">动爻</p>
                <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">
                  {result.chart.moving.position} · {result.chart.moving.yinYang}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#d8cab2]">{result.chart.moving.text}</p>
                <p className="mt-3 border-t border-[#2f261a] pt-3 text-sm leading-7 text-[#f0d49a]">
                  {result.chart.moving.advice}
                </p>
              </article>

              <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <p className="text-sm text-[#b9ad99]">内外关系</p>
                <h2 className="mt-2 font-ritual text-3xl text-[#fff7e8]">{result.chart.mainHexagram.relation}</h2>
                <p className="mt-3 text-sm leading-7 text-[#d8cab2]">{result.chart.mainHexagram.relationAdvice}</p>
              </article>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: "互卦", value: result.chart.mutualHexagram },
                { label: "错卦", value: result.chart.oppositeHexagram },
                { label: "综卦", value: result.chart.reversedHexagram },
              ].map((item) => (
                <article key={item.label} className="rounded-lg border border-[#3a3023] bg-[#080705] p-4">
                  <p className="text-sm text-[#b9ad99]">{item.label} · 第 {item.value.number} 卦</p>
                  <h3 className="mt-2 font-ritual text-2xl text-[#fff7e8]">{item.value.name}</h3>
                  <p className="mt-2 text-xs leading-6 text-[#d8cab2]">{item.value.nature}</p>
                  <p className="mt-2 text-xs leading-6 text-[#80776a]">{item.value.advice}</p>
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
            八卦问事结果会在这里生成，并同步保存到报告中心。
          </div>
        )}
      </div>
    </div>
  );
}
