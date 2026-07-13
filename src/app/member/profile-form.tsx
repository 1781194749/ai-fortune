"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Loader2,
  MapPin,
  Sparkles,
  UserRound,
} from "lucide-react";
import { BirthDatePicker, BirthTimePicker, formatBirthTime } from "./birth-pickers";
import {
  formatBirthDate,
  normalizeBirthCalendarType,
  switchBirthCalendarValue,
  type BirthCalendarType,
  type BirthDateValues,
} from "@/lib/birth-calendar";

export type FortuneProfile = {
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  calendarType: string;
  relationshipStatus: string | null;
  careerFocus: string | null;
  recurringTopics: string[];
  memorySummary: string | null;
  completeness: number;
};

type ProfileResponse =
  | { ok: true; profile: FortuneProfile }
  | { ok: false; message?: string };

type WizardForm = {
  name: string;
  birthDate: string;
  birthDateValues: BirthDateValues;
  birthTime: string;
  timeKnown: boolean;
  birthPlace: string;
  calendarType: BirthCalendarType;
  industry: string;
  role: string;
  recurringTopics: string[];
};

const steps = [
  { label: "称呼", prompt: "先认识一下，我该怎么称呼你？" },
  { label: "生辰", prompt: "接下来记录你的出生日期。请选择公历、农历或阴历。" },
  { label: "时辰", prompt: "出生时辰会让排盘更细。如果不确定，也可以直接告诉我。" },
  { label: "行业", prompt: "你现在主要处在哪个行业或领域？" },
  { label: "身份", prompt: "用一句话描述你现在的职业或身份。" },
  { label: "关注", prompt: "最近最希望我陪你持续关注哪些方向？" },
] as const;

const industryOptions = ["互联网", "金融", "教育", "医疗", "传媒", "制造", "自由职业", "创业", "学生"];
const topicOptions = ["事业", "感情", "财运", "选择", "学业", "年度运势"];

function splitCareerFocus(value: string | null | undefined) {
  if (!value) {
    return { industry: "", role: "" };
  }

  const [possibleIndustry, ...rest] = value.split(" · ");

  if (industryOptions.includes(possibleIndustry)) {
    return { industry: possibleIndustry, role: rest.join(" · ") };
  }

  return { industry: "", role: value };
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] gap-3 sm:max-w-[82%]">
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#c9a35f]/35 bg-[#c9a35f]/8 text-[#efd9a6]">
        <Sparkles size={14} aria-hidden="true" />
      </span>
      <div className="rounded-[20px] rounded-tl-md border border-[#2a2b25] bg-[#11120f] px-4 py-3 text-sm leading-7 text-[#c8c0b2]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto max-w-[88%] rounded-[20px] rounded-br-md bg-[#292a24] px-4 py-3 text-sm leading-7 text-[#eee6d8] sm:max-w-[72%]">
      {children}
    </div>
  );
}

function ChoiceButton({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        selected
          ? "border-[#c9a35f]/65 bg-[#c9a35f]/12 text-[#efd9a6]"
          : "border-[#34352e] bg-[#0d0e0c] text-[#aaa294] hover:border-[#c9a35f]/35 hover:text-[#ded6c8]"
      }`}
    >
      {children}
    </button>
  );
}

function getStepSummary(step: number, form: WizardForm) {
  if (step === 0) {
    return form.name || "暂不填写称呼";
  }

  if (step === 1) {
    return formatBirthDate(form.birthDate, form.calendarType) || "出生日期待补充";
  }

  if (step === 2) {
    const time = form.timeKnown ? formatBirthTime(form.birthTime) || "时辰待补充" : "出生时辰不确定";
    return form.birthPlace ? `${time}，出生地 ${form.birthPlace}` : time;
  }

  if (step === 3) {
    return form.industry || "暂未选择行业";
  }

  if (step === 4) {
    return form.role || "暂未填写身份";
  }

  return form.recurringTopics.length > 0 ? form.recurringTopics.join("、") : "暂未选择关注方向";
}

function canContinue(step: number, form: WizardForm) {
  if (step === 0) {
    return form.name.trim().length > 0;
  }

  if (step === 1) {
    return form.birthDate.length > 0;
  }

  if (step === 2) {
    return !form.timeKnown || form.birthTime.length > 0;
  }

  if (step === 3) {
    return form.industry.trim().length > 0;
  }

  if (step === 4) {
    return form.role.trim().length > 0;
  }

  return form.recurringTopics.length > 0;
}

function CurrentStepFields({
  step,
  form,
  setForm,
}: {
  step: number;
  form: WizardForm;
  setForm: React.Dispatch<React.SetStateAction<WizardForm>>;
}) {
  if (step === 0) {
    return (
      <label className="block">
        <span className="text-xs tracking-[0.18em] text-[#80796e]">你的称呼</span>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#34352e] bg-[#090a08] px-4 focus-within:border-[#c9a35f]/65">
          <UserRound size={17} className="text-[#80796e]" aria-hidden="true" />
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            maxLength={30}
            autoFocus
            placeholder="例如：小林"
            className="h-13 min-w-0 flex-1 bg-transparent text-[#f4efe5] outline-none placeholder:text-[#5f5b53]"
          />
        </div>
      </label>
    );
  }

  if (step === 1) {
    return (
      <BirthDatePicker
        value={form.birthDate}
        calendarType={form.calendarType}
        onCalendarTypeChange={(calendarType: BirthCalendarType) =>
          setForm((current) => {
            const next = switchBirthCalendarValue({
              currentType: normalizeBirthCalendarType(current.calendarType),
              currentValue: current.birthDate,
              values: current.birthDateValues,
              nextType: calendarType,
            });

            return {
              ...current,
              calendarType,
              birthDate: next.value,
              birthDateValues: next.values,
            };
          })
        }
        onChange={(birthDate) =>
          setForm((current) => ({
            ...current,
            birthDate,
            birthDateValues: {
              ...current.birthDateValues,
              [current.calendarType]: birthDate,
            },
          }))
        }
      />
    );
  }

  if (step === 2) {
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          <ChoiceButton
            selected={form.timeKnown}
            onClick={() => setForm((current) => ({ ...current, timeKnown: true }))}
          >
            我知道时辰
          </ChoiceButton>
          <ChoiceButton
            selected={!form.timeKnown}
            onClick={() => setForm((current) => ({ ...current, timeKnown: false, birthTime: "" }))}
          >
            不确定
          </ChoiceButton>
        </div>
        {form.timeKnown ? (
          <BirthTimePicker
            value={form.birthTime}
            onChange={(birthTime) => setForm((current) => ({ ...current, birthTime }))}
          />
        ) : null}
        <label className="mt-4 block">
          <span className="text-xs tracking-[0.18em] text-[#80796e]">出生地（可选）</span>
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#34352e] bg-[#090a08] px-4 focus-within:border-[#c9a35f]/65">
            <MapPin size={17} className="text-[#80796e]" aria-hidden="true" />
            <input
              value={form.birthPlace}
              onChange={(event) => setForm((current) => ({ ...current, birthPlace: event.target.value }))}
              maxLength={60}
              placeholder="例如：上海"
              className="h-13 min-w-0 flex-1 bg-transparent text-[#f4efe5] outline-none placeholder:text-[#5f5b53]"
            />
          </div>
        </label>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {industryOptions.map((industry) => (
            <ChoiceButton
              key={industry}
              selected={form.industry === industry}
              onClick={() => setForm((current) => ({ ...current, industry }))}
            >
              {industry}
            </ChoiceButton>
          ))}
        </div>
        <input
          value={form.industry}
          onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))}
          maxLength={30}
          placeholder="也可以直接输入其他行业"
          className="mt-5 h-13 w-full rounded-2xl border border-[#34352e] bg-[#090a08] px-4 text-[#f4efe5] outline-none placeholder:text-[#5f5b53] focus:border-[#c9a35f]/65"
        />
      </div>
    );
  }

  if (step === 4) {
    return (
      <label className="block">
        <span className="text-xs tracking-[0.18em] text-[#80796e]">职业 / 身份</span>
        <textarea
          value={form.role}
          onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
          rows={3}
          maxLength={80}
          autoFocus
          placeholder="例如：在一家消费科技公司负责产品增长"
          className="mt-3 w-full resize-none rounded-2xl border border-[#34352e] bg-[#090a08] px-4 py-3 text-[#f4efe5] outline-none placeholder:text-[#5f5b53] focus:border-[#c9a35f]/65"
        />
      </label>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {topicOptions.map((topic) => {
        const selected = form.recurringTopics.includes(topic);

        return (
          <ChoiceButton
            key={topic}
            selected={selected}
            onClick={() =>
              setForm((current) => ({
                ...current,
                recurringTopics: selected
                  ? current.recurringTopics.filter((item) => item !== topic)
                  : [...current.recurringTopics, topic],
              }))
            }
          >
            {topic}
          </ChoiceButton>
        );
      })}
    </div>
  );
}

export function ProfileForm({
  initialProfile,
  mode = "member",
}: {
  initialProfile: FortuneProfile | null;
  mode?: "member" | "onboarding";
}) {
  const career = splitCareerFocus(initialProfile?.careerFocus);
  const initialCalendarType = normalizeBirthCalendarType(initialProfile?.calendarType);
  const [profile, setProfile] = useState<FortuneProfile | null>(initialProfile);
  const [form, setForm] = useState<WizardForm>({
    name: initialProfile?.name ?? "",
    birthDate: initialProfile?.birthDate ?? "",
    birthDateValues: initialProfile?.birthDate
      ? { [initialCalendarType]: initialProfile.birthDate }
      : {},
    birthTime: initialProfile?.birthTime ?? "",
    timeKnown: Boolean(initialProfile?.birthTime),
    birthPlace: initialProfile?.birthPlace ?? "",
    calendarType: initialCalendarType,
    industry: career.industry,
    role: career.role,
    recurringTopics: initialProfile?.recurringTopics ?? [],
  });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState((initialProfile?.completeness ?? 0) >= 100);
  const [message, setMessage] = useState(
    (initialProfile?.completeness ?? 0) >= 100
      ? "你的档案已经建立，无需重复填写。"
      : initialProfile
        ? "已有档案已载入，可以继续完善。"
        : "档案会用于之后的个性化推演。",
  );
  const reduceMotion = useReducedMotion();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const answeredFields = [
    form.name,
    form.birthDate,
    form.timeKnown ? form.birthTime : step >= 2 || completed ? "unknown" : "",
    form.industry,
    form.role,
    form.recurringTopics.length > 0 ? "topics" : "",
  ].filter(Boolean).length;
  const previewCompleteness = Math.round((answeredFields / steps.length) * 100);

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript) {
      return;
    }

    transcript.scrollTo({
      top: transcript.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [step, completed, reduceMotion]);

  async function saveProfile() {
    setSaving(true);
    setMessage("正在为你起盘并保存档案...");

    try {
      const careerFocus = [form.industry.trim(), form.role.trim()].filter(Boolean).join(" · ");
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          gender: initialProfile?.gender ?? "",
          birthDate: form.birthDate,
          birthTime: form.timeKnown ? form.birthTime : "",
          birthPlace: form.birthPlace,
          calendarType: form.calendarType,
          relationshipStatus: initialProfile?.relationshipStatus ?? "",
          careerFocus,
          recurringTopics: form.recurringTopics,
        }),
      });
      const data = (await response.json()) as ProfileResponse;

      if (!response.ok || data.ok === false) {
        const failure = data as { ok: false; message?: string };
        throw new Error(failure.message ?? "保存失败。");
      }

      setProfile(data.profile);
      setCompleted(true);
      setMessage(`起盘完成，档案完整度 ${data.profile.completeness}%。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  const containerClass = mode === "onboarding" ? "grid gap-8 lg:grid-cols-[1fr_320px]" : "mt-10 grid gap-6 lg:grid-cols-[1fr_320px]";

  return (
    <section className={containerClass}>
      <div className="rounded-[28px] border border-[#323128] bg-[#0d0e0c] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.3)] sm:p-7">
        <div className="flex items-center justify-between gap-5 border-b border-[#24251f] pb-5">
          <div>
            <p className="text-xs tracking-[0.24em] text-[#c9a35f]">起盘建档</p>
            <h2 className="mt-2 font-ritual text-2xl text-[#f4efe5] sm:text-3xl">
              {completed ? "你的基础命盘已经建立" : `第 ${step + 1} 步 · ${steps[step].label}`}
            </h2>
          </div>
          <span className="text-sm text-[#80796e]">{completed ? profile?.completeness : previewCompleteness}%</span>
        </div>

        <div className="mt-5 flex gap-2" aria-label="建档进度">
          {steps.map((item, index) => (
            <span
              key={item.label}
              className={`h-1 flex-1 rounded-full transition ${
                completed || index <= step ? "bg-[#c9a35f]" : "bg-[#292a24]"
              }`}
            />
          ))}
        </div>

        <div ref={transcriptRef} className="xuanji-scrollbar mt-7 max-h-[360px] space-y-4 overflow-y-auto pr-1 sm:pr-3">
          <AssistantBubble>
            我会先记录几项基础信息。之后你直接提问就好，我会自己判断是否需要抽牌、排盘或起卦。
          </AssistantBubble>

          {completed ? (
            <>
              {steps.map((item, index) => (
                <UserBubble key={item.label}>{getStepSummary(index, form)}</UserBubble>
              ))}
              <AssistantBubble>
                我已经记下你的基础信息了。你可以直接问一个具体问题，比如事业选择、感情关系、财运节奏，或者近期某个决定。
              </AssistantBubble>
            </>
          ) : (
            <>
              {steps.slice(0, step).map((item, index) => (
                <div key={item.label} className="space-y-4">
                  <UserBubble>{getStepSummary(index, form)}</UserBubble>
                  <AssistantBubble>{steps[index + 1]?.prompt}</AssistantBubble>
                </div>
              ))}
              {step === 0 ? <AssistantBubble>{steps[0].prompt}</AssistantBubble> : null}
            </>
          )}
        </div>

        <AnimatePresence mode="wait">
          {completed ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35 }}
              className="mt-7 rounded-[22px] border border-[#2c7b78]/35 bg-[#2c7b78]/8 p-5"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2c7b78]/15 text-[#79b8b1]">
                  <BadgeCheck size={20} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium text-[#e5eee9]">{message}</p>
                  <p className="mt-2 text-sm leading-7 text-[#9eb7b1]">下一次对话会自动读取这些信息，不需要重复说明。</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/chat"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-5 font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
                >
                  进入 Chat，开始问事
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setCompleted(false);
                    setStep(0);
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#3a3a31] px-5 text-sm text-[#c8c0b2] transition hover:border-[#c9a35f]/45"
                >
                  再检查一下
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.28 }}
              className="mt-7 rounded-[22px] border border-[#323128] bg-[#11120f] p-5 sm:p-6"
            >
              <CurrentStepFields step={step} form={form} setForm={setForm} />
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  disabled={step === 0 || saving}
                  className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm text-[#8f887b] transition hover:text-[#ded6c8] disabled:invisible"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  上一步
                </button>
                <button
                  type="button"
                  onClick={step === steps.length - 1 ? saveProfile : () => setStep((current) => current + 1)}
                  disabled={!canContinue(step, form) || saving}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a35f] px-6 text-sm font-semibold text-[#17130d] transition hover:bg-[#efd9a6] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                  {saving ? "正在起盘" : step === steps.length - 1 ? "完成建档" : "继续"}
                  {!saving ? <ArrowRight size={16} aria-hidden="true" /> : null}
                </button>
              </div>
              <p className="mt-4 min-h-5 text-xs text-[#777168]" aria-live="polite">{message}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside className="h-fit rounded-[28px] border border-[#323128] bg-[#11120f] p-5 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-[#80796e]">
              {completed ? "档案已建立" : "档案正在成形"}
            </p>
            <p className="mt-2 font-ritual text-2xl text-[#f4efe5]">{form.name || "你的命盘"}</p>
          </div>
          <div
            className="flex size-16 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#c9a35f ${completed ? profile?.completeness ?? 0 : previewCompleteness}%, #292a24 0)`,
            }}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-[#11120f] text-xs text-[#efd9a6]">
              {completed ? profile?.completeness : previewCompleteness}%
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-4 border-t border-[#24251f] pt-5 text-sm">
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#777168]">生辰</span>
            <span className="max-w-[210px] text-right text-[#c8c0b2]">
              {formatBirthDate(form.birthDate, form.calendarType) || "待记录"}
              {form.timeKnown && form.birthTime ? ` · ${formatBirthTime(form.birthTime)}` : ""}
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#777168]">行业</span>
            <span className="text-right text-[#c8c0b2]">{form.industry || "待记录"}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="text-[#777168]">身份</span>
            <span className="max-w-[180px] text-right text-[#c8c0b2]">{form.role || "待记录"}</span>
          </div>
        </div>

        <div className="mt-6 flex min-h-20 flex-wrap content-start gap-2 border-t border-[#24251f] pt-5">
          {form.recurringTopics.length > 0 ? (
            form.recurringTopics.map((topic) => (
              <span key={topic} className="h-fit rounded-full border border-[#2c7b78]/30 bg-[#2c7b78]/8 px-3 py-1.5 text-xs text-[#79b8b1]">
                {topic}
              </span>
            ))
          ) : (
            <p className="text-xs leading-6 text-[#777168]">选择关注方向后，它们会成为之后对话的长期上下文。</p>
          )}
        </div>

        {profile?.memorySummary ? (
          <p className="mt-5 border-t border-[#24251f] pt-5 text-xs leading-6 text-[#8f887b]">{profile.memorySummary}</p>
        ) : null}
      </aside>
    </section>
  );
}
