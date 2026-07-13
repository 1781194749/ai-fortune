"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Loader2, Sparkles } from "lucide-react";
import { BirthDatePicker, BirthTimePicker } from "@/app/member/birth-pickers";
import {
  normalizeBirthCalendarType,
  switchBirthCalendarValue,
  type BirthCalendarType,
  type BirthDateValues,
} from "@/lib/birth-calendar";
import { getStarCostLabel } from "@/lib/commerce";

type BaziPillar = {
  label: string;
  ganzhi: string;
  wuxing: string;
};

type BaziChart = {
  solar: string;
  lunar: string;
  zodiac: string;
  bazi: string[];
  counts: Record<string, number>;
  strongest: string;
  weakest: string[];
  pillars: BaziPillar[];
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
  const { calendarType, birthDate } = birthSelection;

  async function analyze() {
    if (calendarType === "yinli") {
      setMessage("八字排盘需要可换算到具体日期，请选择公历或农历；阴历月相记录可保留在个人档案中。");
      return;
    }

    setLoading(true);
    setResult(null);
    setMessage("正在排盘并统计五行...");

    const response = await fetch("/api/fortune/bazi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender, birthDate, birthTime, birthPlace }),
    });
    const data = (await response.json()) as
      | ({ ok: true } & BaziResult)
      | { ok: false; message?: string; balance?: number };

    setLoading(false);

    if (!response.ok || data.ok === false) {
      const failure = data as { ok: false; message?: string; balance?: number };
      setMessage(failure.message ?? "八字五行简析失败。");
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
            <span className="text-sm text-[#d8cab2]">性别</span>
            <input
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              placeholder="可不填"
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
          {loading ? "排盘中..." : "生成八字五行简析"}
        </button>
        <p className="mt-3 text-sm text-[#b9ad99]">{message}</p>
      </section>

      <section className="rounded-lg border border-[#3a3023] bg-[#12100d] p-5">
        <p className="text-sm font-semibold text-[#c8a15a]">排盘过程</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {(result?.steps ?? ["校验出生信息", "计算四柱八字", "统计五行分布", "生成简析报告"]).map(
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
                  <p className="mt-2 text-sm text-[#f0d49a]">{pillar.wuxing}</p>
                </article>
              ))}
            </div>

            <div className="rounded-lg border border-[#3a3023] bg-[#080705] p-5">
              <h2 className="font-ritual text-3xl text-[#fff7e8]">五行分布</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {wuxingOrder.map((element) => (
                  <div key={element} className="rounded-md bg-[#12100d] p-3">
                    <p className="text-sm text-[#b9ad99]">{element}</p>
                    <p className="mt-1 text-2xl font-semibold text-[#f0d49a]">
                      {result.chart.counts[element]}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-[#b9ad99]">
                生肖：{result.chart.zodiac} / 公历：{result.chart.solar}
              </p>
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
            八字五行结果会在这里生成，并同步保存到报告中心。
          </div>
        )}
      </section>
    </div>
  );
}
