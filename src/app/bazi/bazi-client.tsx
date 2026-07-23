"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  QuestionProcessPanel,
  type QuestionProcessState,
} from "@/app/_components/question-process-panel";
import { BirthDatePicker, BirthTimePicker } from "@/app/member/birth-pickers";
import {
  normalizeBirthCalendarType,
  switchBirthCalendarValue,
  type BirthCalendarType,
  type BirthDateValues,
} from "@/lib/birth-calendar";
import { getStarCostLabel } from "@/lib/commerce";

type BaziPillar = {
  key: string;
  label: string;
  ganzhi: string;
  heavenlyStem: string;
  earthlyBranch: string;
  stemElement: string;
  branchElement: string;
  yinYang: string;
  wuxing: string;
  naYin: string;
  diShi: string;
  xunKong: string;
  stemTenGod: string;
  hiddenStems: Array<{
    stem: string;
    element: string;
    tenGod: string;
  }>;
};

type BaziChart = {
  solar: string;
  lunar: string;
  zodiac: string;
  bazi: string[];
  counts: Record<string, number>;
  weightedCounts: Record<string, number>;
  strongest: string;
  weakest: string[];
  pillars: BaziPillar[];
  dayMaster: {
    stem: string;
    element: string;
    yinYang: string;
    seasonElement: string;
    supportScore: number;
    drainScore: number;
    balanceScore: number;
    strengthLabel: string;
    usefulElements: string[];
    avoidElements: string[];
    explanation: string;
  };
  tenGodCounts: Record<string, number>;
  branchRelations: Array<{
    type: string;
    branches: string[];
    element?: string;
    advice: string;
  }>;
  luck: {
    start: {
      solar: string;
      direction: string;
    };
    currentDaYun?: {
      ganZhi: string;
      startYear: number;
      endYear: number;
      startAge: number;
      endAge: number;
      tenGod: string;
      advice: string;
    };
    daYun: Array<{
      ganZhi: string;
      startYear: number;
      endYear: number;
      startAge: number;
      endAge: number;
      phase: string;
      tenGod: string;
    }>;
    annual: Array<{
      year: number;
      ganZhi: string;
      tenGod: string;
      branchSignals: string[];
      advice: string;
    }>;
  };
};

type BaziReport = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

type BaziResult = {
  steps: string[];
  cost: number;
  balanceAfter: number;
  chart: BaziChart;
  report: BaziReport;
};

const wuxingOrder = ["木", "火", "土", "金", "水"] as const;

const baziProcessSteps = [
  { label: "校验出生信息", detail: "确认历法、日期、时辰和出生地是否足够排盘。" },
  { label: "计算四柱十神", detail: "换算四柱干支、十神、藏干、纳音与地势。" },
  { label: "分析旺衰喜忌", detail: "结合月令、根气和五行生克判断日主强弱。" },
  { label: "排大运流年", detail: "生成起运、当前大运和未来流年节奏。" },
  { label: "生成命盘报告", detail: "输出结构判断、喜用方向和可追问问题。" },
] as const;

type InitialBaziProfile = {
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  calendarType: string;
};

export function BaziClient({
  initialBalance,
  initialProfile,
}: {
  initialBalance: number;
  initialProfile: InitialBaziProfile;
}) {
  const initialCalendarType = normalizeBirthCalendarType(initialProfile.calendarType);
  const initialBirthDate = initialProfile.birthDate ?? "";
  const [balance, setBalance] = useState(initialBalance);
  const [name, setName] = useState(initialProfile.name ?? "");
  const [gender, setGender] = useState(initialProfile.gender ?? "");
  const [birthSelection, setBirthSelection] = useState<{
    calendarType: BirthCalendarType;
    birthDate: string;
    values: BirthDateValues;
  }>({
    calendarType: initialCalendarType,
    birthDate: initialBirthDate,
    values: initialBirthDate ? { [initialCalendarType]: initialBirthDate } : {},
  });
  const [birthTime, setBirthTime] = useState(initialProfile.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(initialProfile.birthPlace ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(`本次消耗 ${getStarCostLabel("bazi_brief")}。`);
  const [result, setResult] = useState<BaziResult | null>(null);
  const [processState, setProcessState] = useState<QuestionProcessState>("idle");
  const { calendarType, birthDate } = birthSelection;

  async function analyze() {
    if (calendarType === "yinli") {
      setMessage("八字排盘需要可换算到具体日期，请选择公历或农历；阴历月相记录可保留在个人档案中。");
      return;
    }

    setLoading(true);
    setResult(null);
    setProcessState("running");
    setMessage("已开始八字命盘详析，正在校验资料、排盘和生成报告。");

    const response = await fetch("/api/fortune/bazi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        gender,
        birthDate,
        birthTime,
        birthPlace,
        calendarType,
      }),
    });
    const data = (await response.json()) as
      | ({ ok: true } & BaziResult)
      | { ok: false; message?: string; balance?: number };

    setLoading(false);

    if (!response.ok || data.ok === false) {
      const failure = data as { ok: false; message?: string; balance?: number };
      setProcessState("error");
      setMessage(failure.message ?? "八字命盘详析没有完成，本次不会生成报告。");
      if (typeof failure.balance === "number") {
        setBalance(failure.balance);
      }
      return;
    }

    setResult(data);
    setProcessState("success");
    setBalance(data.balanceAfter);
    setMessage(`八字命盘详析已完成，本次服务消耗 ${data.cost} 星力，剩余 ${data.balanceAfter} 星力。`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <div className="flex items-center justify-between gap-4 border-b border-[#2f261a] pb-5">
          <div>
            <p className="text-sm text-[#b9ad99]">当前星力</p>
            <p className="font-ritual text-4xl text-[#fff7e8]">{balance}</p>
          </div>
          <Sparkles className="text-[#c8a15a]" size={30} aria-hidden="true" />
        </div>

        <div className="mt-5 grid gap-4">
          <label className="block">
            <span className="text-sm text-[#d8cab2]">姓名或称呼</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="可不填"
              className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
            />
          </label>
          <label className="block">
            <span className="text-sm text-[#d8cab2]">性别（选填）</span>
            <input
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              placeholder="不填时按男命顺逆规则暂排"
              className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
            />
          </label>
          <BirthDatePicker
            value={birthDate}
            calendarType={calendarType}
            onCalendarTypeChange={(nextType) =>
              setBirthSelection((current) => {
                const next = switchBirthCalendarValue({
                  currentType: current.calendarType,
                  currentValue: current.birthDate,
                  values: current.values,
                  nextType,
                });

                return {
                  calendarType: nextType,
                  birthDate: next.value,
                  values: next.values,
                };
              })
            }
            onChange={(nextBirthDate) =>
              setBirthSelection((current) => ({
                ...current,
                birthDate: nextBirthDate,
                values: {
                  ...current.values,
                  [current.calendarType]: nextBirthDate,
                },
              }))
            }
          />
          <BirthTimePicker value={birthTime} onChange={setBirthTime} />
          {calendarType === "yinli" ? (
            <p className="rounded-2xl border border-[#b84b37]/25 bg-[#b84b37]/7 px-4 py-3 text-xs leading-6 text-[#d98572]">
              阴历是纯月相记录，不含可用于四柱换算的节气规则。请切换公历或农历后排盘。
            </p>
          ) : null}
          <label className="block">
            <span className="text-sm text-[#d8cab2]">出生地</span>
            <input
              value={birthPlace}
              onChange={(event) => setBirthPlace(event.target.value)}
              placeholder="城市"
              className="mt-2 h-12 w-full rounded-md border border-[#3a3023] bg-[#080705] px-4 text-[#fff7e8] outline-none transition placeholder:text-[#6f6455] focus:border-[#c8a15a]"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={analyze}
          disabled={loading || !birthDate || !birthTime || calendarType === "yinli"}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#c8a15a] px-5 font-semibold text-[#130f09] transition hover:bg-[#f0d49a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          ) : (
            <Sparkles size={18} aria-hidden="true" />
          )}
          {loading ? "排盘中..." : "生成八字命盘详析"}
        </button>
        <p className="mt-3 text-sm text-[#b9ad99]">{message}</p>
      </section>

      <div>
        <QuestionProcessPanel
          title="排盘过程"
          service={{
            type: "八字命盘详析",
            method: "四柱十神 + 旺衰喜忌 + 大运流年",
            cost: getStarCostLabel("bazi_brief"),
            output: "命盘结构 + 阶段建议",
          }}
          steps={baziProcessSteps}
          state={processState}
          completedSteps={result?.steps}
          resultTitle={result?.report.title}
          resultSummary={result?.report.summary}
          nextActions={["补充档案继续追问", "查看完整报告", "围绕事业或关系深挖"]}
          errorMessage={processState === "error" ? message : undefined}
          onRetry={loading ? undefined : () => void analyze()}
        />

        {result ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {result.chart.pillars.map((pillar) => (
                <article
                  key={pillar.label}
                  className="rounded-lg border border-[#4a3a25] bg-[#0b0906] p-4"
                >
                  <p className="text-sm text-[#b9ad99]">{pillar.label}</p>
                  <h3 className="mt-3 font-ritual text-3xl text-[#fff7e8]">
                    {pillar.ganzhi}
                  </h3>
                  <p className="mt-2 text-sm text-[#f0d49a]">
                    {pillar.stemTenGod} · {pillar.wuxing}
                  </p>
                  <p className="mt-3 text-xs leading-6 text-[#b9ad99]">
                    藏干：{pillar.hiddenStems.map((item) => `${item.stem}${item.tenGod}`).join("、") || "无"}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-[#80776a]">
                    纳音：{pillar.naYin} / 地势：{pillar.diShi} / 空亡：{pillar.xunKong}
                  </p>
                </article>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <h2 className="font-ritual text-3xl text-[#fff7e8]">日主旺衰</h2>
                <p className="mt-3 text-sm leading-7 text-[#d8cab2]">
                  {result.chart.dayMaster.stem}{result.chart.dayMaster.element}日主 · {result.chart.dayMaster.yinYang} · {result.chart.dayMaster.strengthLabel}
                </p>
                <p className="mt-3 text-sm leading-7 text-[#b9ad99]">
                  {result.chart.dayMaster.explanation}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-[#12100d] p-3">
                    <p className="text-xs text-[#80776a]">扶身</p>
                    <p className="mt-1 text-lg text-[#f0d49a]">{result.chart.dayMaster.supportScore}</p>
                  </div>
                  <div className="rounded-md bg-[#12100d] p-3">
                    <p className="text-xs text-[#80776a]">耗克</p>
                    <p className="mt-1 text-lg text-[#f0d49a]">{result.chart.dayMaster.drainScore}</p>
                  </div>
                  <div className="rounded-md bg-[#12100d] p-3">
                    <p className="text-xs text-[#80776a]">喜用</p>
                    <p className="mt-1 text-lg text-[#f0d49a]">{result.chart.dayMaster.usefulElements.join("、")}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <h2 className="font-ritual text-3xl text-[#fff7e8]">五行与十神</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                  {wuxingOrder.map((element) => (
                    <div key={element} className="rounded-md bg-[#12100d] p-3">
                      <p className="text-sm text-[#b9ad99]">{element}</p>
                      <p className="mt-1 text-2xl font-semibold text-[#f0d49a]">
                        {result.chart.weightedCounts[element] ?? result.chart.counts[element]}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(result.chart.tenGodCounts).slice(0, 8).map(([god, count]) => (
                    <span key={god} className="rounded-md border border-[#3a3023] px-2 py-1 text-xs text-[#d8cab2]">
                      {god} {count}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[#b9ad99]">
                  生肖：{result.chart.zodiac} / 公历：{result.chart.solar}
                </p>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <h2 className="font-ritual text-3xl text-[#fff7e8]">地支关系</h2>
                {result.chart.branchRelations.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {result.chart.branchRelations.map((relation) => (
                      <div key={`${relation.type}-${relation.branches.join("")}`} className="rounded-md bg-[#12100d] p-3">
                        <p className="text-sm text-[#f0d49a]">
                          {relation.type} · {relation.branches.join("、")}{relation.element ? ` · ${relation.element}` : ""}
                        </p>
                        <p className="mt-2 text-xs leading-6 text-[#b9ad99]">{relation.advice}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-[#b9ad99]">未见明显合冲刑害成组，判断更重视日主旺衰和大运流年。</p>
                )}
              </article>

              <article className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
                <h2 className="font-ritual text-3xl text-[#fff7e8]">大运流年</h2>
                <p className="mt-3 text-sm leading-7 text-[#d8cab2]">
                  {result.chart.luck.start.direction} · 起运约 {result.chart.luck.start.solar}
                </p>
                {result.chart.luck.currentDaYun ? (
                  <p className="mt-3 rounded-md bg-[#12100d] p-3 text-sm leading-7 text-[#f0d49a]">
                    当前大运：{result.chart.luck.currentDaYun.ganZhi}（{result.chart.luck.currentDaYun.startYear}-{result.chart.luck.currentDaYun.endYear}）· {result.chart.luck.currentDaYun.tenGod}
                  </p>
                ) : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {result.chart.luck.annual.slice(0, 6).map((year) => (
                    <div key={year.year} className="rounded-md border border-[#2f261a] p-3">
                      <p className="text-sm text-[#f0d49a]">{year.year} {year.ganZhi}</p>
                      <p className="mt-1 text-xs text-[#b9ad99]">{year.tenGod || "流年"}</p>
                      {year.branchSignals.length > 0 ? (
                        <p className="mt-1 text-[11px] text-[#80776a]">{year.branchSignals.join("、")}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
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
            八字命盘结果会在这里生成，并同步保存到报告中心。
          </div>
        )}
      </div>
    </div>
  );
}
