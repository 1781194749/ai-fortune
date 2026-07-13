"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MoonStar,
  Sparkles,
  X,
} from "lucide-react";
import {
  birthCalendarOptions,
  formatBirthDate,
  getLunarMonths,
  getLunarPartsFromSolar,
  getSolarMonthDayCount,
  lunarPartsToSolarYmd,
  normalizeBirthCalendarType,
  parseYmd,
  toYmd,
  type BirthCalendarType,
  type DateParts,
} from "@/lib/birth-calendar";

const weekdays = ["日", "一", "二", "三", "四", "五", "六"] as const;
const lunarDayNames = [
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
] as const;

const shichenOptions = [
  { name: "子时", branch: "子", range: "23:00–00:59", value: "23:00" },
  { name: "丑时", branch: "丑", range: "01:00–02:59", value: "01:00" },
  { name: "寅时", branch: "寅", range: "03:00–04:59", value: "03:00" },
  { name: "卯时", branch: "卯", range: "05:00–06:59", value: "05:00" },
  { name: "辰时", branch: "辰", range: "07:00–08:59", value: "07:00" },
  { name: "巳时", branch: "巳", range: "09:00–10:59", value: "09:00" },
  { name: "午时", branch: "午", range: "11:00–12:59", value: "11:00" },
  { name: "未时", branch: "未", range: "13:00–14:59", value: "13:00" },
  { name: "申时", branch: "申", range: "15:00–16:59", value: "15:00" },
  { name: "酉时", branch: "酉", range: "17:00–18:59", value: "17:00" },
  { name: "戌时", branch: "戌", range: "19:00–20:59", value: "19:00" },
  { name: "亥时", branch: "亥", range: "21:00–22:59", value: "21:00" },
] as const;

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: currentYear - 1919 }, (_, index) => currentYear - index);
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function getDefaultParts(calendarType: BirthCalendarType, value: string): DateParts {
  const fallback = { year: Math.max(1920, currentYear - 28), month: 1, day: 1 };

  if (calendarType === "lunar") {
    return getLunarPartsFromSolar(value) ?? getLunarPartsFromSolar(toYmd(fallback)) ?? fallback;
  }

  return parseYmd(value) ?? fallback;
}

function getShichen(value: string) {
  const hour = Number(value.split(":")[0]);

  if (!Number.isInteger(hour)) {
    return null;
  }

  if (hour === 23 || hour === 0) {
    return shichenOptions[0];
  }

  const index = Math.floor((hour + 1) / 2);
  return shichenOptions[index] ?? null;
}

export function formatBirthTime(value: string) {
  if (!value) {
    return "";
  }

  const shichen = getShichen(value);
  return shichen ? `${shichen.name} · ${value}` : value;
}

function PickerShell({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const shell = (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <motion.button
        type="button"
        aria-label="关闭选择器"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="absolute inset-0 bg-black/72 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 24, scale: reduceMotion ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : 0.98 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 32 }}
        className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[30px] border border-[#3a392f] bg-[#11120f] shadow-[0_-20px_90px_rgba(0,0,0,0.55)] sm:max-w-[680px] sm:rounded-[30px]"
      >
        <div className="flex items-center justify-between border-b border-[#292a24] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] tracking-[0.24em] text-[#c9a35f]">{eyebrow}</p>
            <h3 className="mt-1 font-ritual text-xl text-[#f4efe5]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-10 items-center justify-center rounded-full border border-[#34352e] text-[#8f887b] transition hover:border-[#c9a35f]/50 hover:text-[#efd9a6]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(shell, document.body);
}

function CalendarModeTabs({
  value,
  onChange,
}: {
  value: BirthCalendarType;
  onChange: (value: BirthCalendarType) => void;
}) {
  const selectedOption = birthCalendarOptions.find((option) => option.value === value);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs tracking-[0.18em] text-[#80796e]">出生历法</p>
        <span className="text-[11px] text-[#68645c]">选择一种即可</span>
      </div>
      <div
        role="radiogroup"
        aria-label="出生历法"
        className="mt-3 grid grid-cols-3 rounded-2xl border border-[#34352e] bg-[#090a08] p-1.5"
      >
        {birthCalendarOptions.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-sm transition ${
                selected
                  ? "bg-[#c9a35f] font-semibold text-[#17130d] shadow-[0_7px_20px_rgba(201,163,95,0.16)]"
                  : "text-[#8f887b] hover:bg-[#181914] hover:text-[#ded6c8]"
              }`}
            >
              {selected ? <Check size={14} aria-hidden="true" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#69655d]">
        {selectedOption?.label} · {selectedOption?.description}
      </p>
    </div>
  );
}

function SolarDatePanel({
  draft,
  onChange,
}: {
  draft: DateParts;
  onChange: (value: DateParts) => void;
}) {
  const dayCount = getSolarMonthDayCount(draft.year, draft.month);
  const firstWeekday = new Date(Date.UTC(draft.year, draft.month - 1, 1)).getUTCDay();
  const today = new Date();
  const cells = Array.from({ length: firstWeekday + dayCount }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1,
  );

  function changeMonth(offset: number) {
    const date = new Date(Date.UTC(draft.year, draft.month - 1 + offset, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    if (year < 1920 || year > currentYear) {
      return;
    }

    onChange({ year, month, day: Math.min(draft.day, getSolarMonthDayCount(year, month)) });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="上个月"
          className="flex size-10 items-center justify-center rounded-xl border border-[#34352e] text-[#aaa294] transition hover:border-[#c9a35f]/45 hover:text-[#efd9a6]"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <label className="relative">
            <span className="sr-only">年份</span>
            <select
              value={draft.year}
              onChange={(event) => {
                const year = Number(event.target.value);
                onChange({ ...draft, year, day: Math.min(draft.day, getSolarMonthDayCount(year, draft.month)) });
              }}
              className="h-10 w-full appearance-none rounded-xl border border-[#34352e] bg-[#0b0c0a] px-3 text-sm text-[#ded6c8] outline-none focus:border-[#c9a35f]/60"
            >
              {yearOptions.map((year) => <option key={year} value={year}>{year} 年</option>)}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[#777168]" aria-hidden="true" />
          </label>
          <label className="relative">
            <span className="sr-only">月份</span>
            <select
              value={draft.month}
              onChange={(event) => {
                const month = Number(event.target.value);
                onChange({ ...draft, month, day: Math.min(draft.day, getSolarMonthDayCount(draft.year, month)) });
              }}
              className="h-10 w-full appearance-none rounded-xl border border-[#34352e] bg-[#0b0c0a] px-3 text-sm text-[#ded6c8] outline-none focus:border-[#c9a35f]/60"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={month}>{month} 月</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-3 text-[#777168]" aria-hidden="true" />
          </label>
        </div>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="下个月"
          className="flex size-10 items-center justify-center rounded-xl border border-[#34352e] text-[#aaa294] transition hover:border-[#c9a35f]/45 hover:text-[#efd9a6]"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-[11px] text-[#68645c]">
        {weekdays.map((weekday) => <span key={weekday} className="py-2">{weekday}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`empty-${index}`} className="h-10 sm:h-11" />;
          }

          const selected = draft.day === day;
          const future =
            draft.year > today.getFullYear() ||
            (draft.year === today.getFullYear() && draft.month > today.getMonth() + 1) ||
            (draft.year === today.getFullYear() && draft.month === today.getMonth() + 1 && day > today.getDate());

          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => onChange({ ...draft, day })}
              className={`h-10 rounded-xl text-sm transition sm:h-11 ${
                selected
                  ? "bg-[#c9a35f] font-semibold text-[#17130d] shadow-[0_8px_20px_rgba(201,163,95,0.2)]"
                  : "text-[#c8c0b2] hover:bg-[#292a24]"
              } disabled:cursor-not-allowed disabled:text-[#3f4039]`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LunarDatePanel({
  calendarType,
  draft,
  onChange,
}: {
  calendarType: "lunar" | "yinli";
  draft: DateParts;
  onChange: (value: DateParts) => void;
}) {
  const months = calendarType === "lunar"
    ? getLunarMonths(draft.year)
    : Array.from({ length: 12 }, (_, index) => ({
        value: index + 1,
        label: `第 ${index + 1} 月`,
        days: 30,
        leap: false,
      }));
  const activeMonth = months.find((month) => month.value === draft.month) ?? months[0];
  const dayCount = activeMonth?.days ?? 30;

  function changeYear(year: number) {
    const nextMonths = calendarType === "lunar"
      ? getLunarMonths(year)
      : months;
    const month = nextMonths.some((item) => item.value === draft.month)
      ? draft.month
      : nextMonths[0]?.value ?? 1;
    const nextMonth = nextMonths.find((item) => item.value === month);
    onChange({ year, month, day: Math.min(draft.day, nextMonth?.days ?? 30) });
  }

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">年份</span>
        <select
          value={draft.year}
          onChange={(event) => changeYear(Number(event.target.value))}
          className="h-11 w-full appearance-none rounded-xl border border-[#34352e] bg-[#0b0c0a] px-4 text-sm text-[#ded6c8] outline-none focus:border-[#c9a35f]/60"
        >
          {yearOptions.map((year) => <option key={year} value={year}>{year} 年</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-4 top-3.5 text-[#777168]" aria-hidden="true" />
      </label>

      <p className="mt-5 text-[11px] tracking-[0.16em] text-[#777168]">选择月份</p>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {months.map((month) => {
          const selected = month.value === draft.month;
          return (
            <button
              key={`${month.value}-${month.label}`}
              type="button"
              onClick={() => onChange({ ...draft, month: month.value, day: Math.min(draft.day, month.days) })}
              className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                selected
                  ? "border-[#c9a35f]/65 bg-[#c9a35f]/12 text-[#efd9a6]"
                  : "border-[#30312b] bg-[#0b0c0a] text-[#aaa294] hover:border-[#c9a35f]/35"
              }`}
            >
              {month.label}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-[11px] tracking-[0.16em] text-[#777168]">选择日期</p>
      <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => {
          const selected = draft.day === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange({ ...draft, day })}
              aria-label={calendarType === "lunar" ? lunarDayNames[day - 1] : `第 ${day} 日`}
              className={`aspect-square rounded-xl text-xs transition ${
                selected
                  ? "bg-[#c9a35f] font-semibold text-[#17130d]"
                  : "bg-[#0b0c0a] text-[#aaa294] hover:bg-[#292a24]"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BirthDateDialog({
  calendarType,
  value,
  onConfirm,
  onClose,
}: {
  calendarType: BirthCalendarType;
  value: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DateParts>(() => getDefaultParts(calendarType, value));
  const previewValue = calendarType === "lunar" ? lunarPartsToSolarYmd(draft) : toYmd(draft);
  const preview = formatBirthDate(previewValue, calendarType);

  return (
    <PickerShell title="选择出生日期" eyebrow={`${birthCalendarOptions.find((item) => item.value === calendarType)?.label ?? "公历"}日期`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="xuanji-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {calendarType === "solar" ? (
            <SolarDatePanel draft={draft} onChange={setDraft} />
          ) : (
            <LunarDatePanel calendarType={calendarType} draft={draft} onChange={setDraft} />
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-[#292a24] bg-[#11120f] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <MoonStar size={18} className="mt-0.5 shrink-0 text-[#79b8b1]" aria-hidden="true" />
            <div>
              <p className="text-xs text-[#789e99]">当前选择</p>
              <p className="mt-1 text-sm text-[#dbe8e4]">{preview}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirm(previewValue);
              onClose();
            }}
            disabled={!previewValue}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-6 text-sm font-semibold text-[#17130d] transition hover:bg-[#efd9a6] disabled:opacity-40"
          >
            <Check size={16} aria-hidden="true" />
            确认日期
          </button>
        </div>
      </div>
    </PickerShell>
  );
}

export function BirthDatePicker({
  value,
  calendarType,
  onCalendarTypeChange,
  onChange,
}: {
  value: string;
  calendarType: string;
  onCalendarTypeChange: (value: BirthCalendarType) => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalizedType = normalizeBirthCalendarType(calendarType);
  const formatted = formatBirthDate(value, normalizedType);

  return (
    <div>
      <CalendarModeTabs value={normalizedType} onChange={onCalendarTypeChange} />
      <div className="mt-4">
        <p className="text-xs tracking-[0.18em] text-[#80796e]">出生日期</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group mt-3 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-[#34352e] bg-[#090a08] px-4 text-left transition hover:border-[#c9a35f]/55 focus-visible:border-[#c9a35f]/65"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#c9a35f]/8 text-[#c9a35f] transition group-hover:bg-[#c9a35f]/12">
            <CalendarDays size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-[#6f6a61]">点击整栏打开日期选择器</span>
            <span className={`mt-0.5 block truncate text-sm ${formatted ? "text-[#f4efe5]" : "text-[#5f5b53]"}`}>
              {formatted || "请选择你的出生日期"}
            </span>
          </span>
          <ChevronDown size={17} className="shrink-0 text-[#777168] transition group-hover:text-[#c9a35f]" aria-hidden="true" />
        </button>
        {normalizedType === "lunar" ? (
          <p className="mt-2 text-xs leading-5 text-[#69655d]">支持闰月，并自动换算对应的公历日期。</p>
        ) : normalizedType === "yinli" ? (
          <p className="mt-2 text-xs leading-5 text-[#69655d]">按纯月相周期记录，不使用农历的节气与闰月规则。</p>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <BirthDateDialog
            calendarType={normalizedType}
            value={value}
            onConfirm={onChange}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BirthTimeDialog({
  value,
  onConfirm,
  onClose,
}: {
  value: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"shichen" | "exact">(() => value && !value.endsWith(":00") ? "exact" : "shichen");
  const [draft, setDraft] = useState(value || "09:00");
  const [hour = "09", minute = "00"] = draft.split(":");
  const activeShichen = getShichen(draft);

  return (
    <PickerShell title="选择出生时辰" eyebrow="TIME OF BIRTH" onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="xuanji-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-2 rounded-2xl border border-[#30312b] bg-[#0b0c0a] p-1">
          {([
            { value: "shichen", label: "十二时辰" },
            { value: "exact", label: "精确时间" },
          ] as const).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={`relative rounded-xl px-4 py-2.5 text-sm transition ${mode === item.value ? "text-[#17130d]" : "text-[#8f887b] hover:text-[#ded6c8]"}`}
            >
              {mode === item.value ? (
                <motion.span
                  layoutId="birth-time-mode"
                  className="absolute inset-0 rounded-xl bg-[#c9a35f]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>

          {mode === "shichen" ? (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shichenOptions.map((item) => {
              const selected = activeShichen?.name === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setDraft(item.value)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    selected
                      ? "border-[#c9a35f]/65 bg-[#c9a35f]/12"
                      : "border-[#30312b] bg-[#0b0c0a] hover:border-[#c9a35f]/35"
                  }`}
                >
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full font-ritual text-lg ${selected ? "bg-[#c9a35f] text-[#17130d]" : "bg-[#22231e] text-[#aaa294]"}`}>
                    {item.branch}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm ${selected ? "text-[#efd9a6]" : "text-[#ded6c8]"}`}>{item.name}</span>
                    <span className="mt-1 block text-[10px] text-[#777168]">{item.range}</span>
                  </span>
                </button>
              );
            })}
            </div>
          ) : (
            <div className="mt-6 rounded-[24px] border border-[#30312b] bg-[#0b0c0a] p-5 sm:p-7">
            <div className="flex items-center justify-center gap-3">
              <label className="relative">
                <span className="sr-only">小时</span>
                <select
                  value={hour}
                  onChange={(event) => setDraft(`${event.target.value}:${minute}`)}
                  className="h-20 w-28 appearance-none rounded-2xl border border-[#3a3a31] bg-[#11120f] px-5 text-center font-ritual text-3xl text-[#efd9a6] outline-none focus:border-[#c9a35f]/65"
                >
                  {hourOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <span className="mt-2 block text-center text-xs text-[#777168]">小时</span>
              </label>
              <span className="mb-6 font-ritual text-3xl text-[#c9a35f]">:</span>
              <label className="relative">
                <span className="sr-only">分钟</span>
                <select
                  value={minute}
                  onChange={(event) => setDraft(`${hour}:${event.target.value}`)}
                  className="h-20 w-28 appearance-none rounded-2xl border border-[#3a3a31] bg-[#11120f] px-5 text-center font-ritual text-3xl text-[#efd9a6] outline-none focus:border-[#c9a35f]/65"
                >
                  {minuteOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <span className="mt-2 block text-center text-xs text-[#777168]">分钟</span>
              </label>
            </div>
            <p className="mt-5 text-center text-sm text-[#8f887b]">对应 {activeShichen?.name ?? "未知时辰"} · {activeShichen?.range}</p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-[#292a24] bg-[#11120f] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-[#c9a35f]" aria-hidden="true" />
            <div>
              <p className="text-xs text-[#8f887b]">将记录为</p>
              <p className="mt-1 text-sm text-[#efd9a6]">{formatBirthTime(draft)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirm(draft);
              onClose();
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#c9a35f] px-6 text-sm font-semibold text-[#17130d] transition hover:bg-[#efd9a6]"
          >
            <Check size={16} aria-hidden="true" />
            确认时辰
          </button>
        </div>
      </div>
    </PickerShell>
  );
}

export function BirthTimePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const formatted = formatBirthTime(value);

  return (
    <div className="mt-5">
      <p className="text-xs tracking-[0.18em] text-[#80796e]">出生时间</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mt-3 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-[#34352e] bg-[#090a08] px-4 text-left transition hover:border-[#c9a35f]/55 focus-visible:border-[#c9a35f]/65"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2c7b78]/10 text-[#79b8b1] transition group-hover:bg-[#2c7b78]/16">
          <Clock3 size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-[#6f6a61]">点击整栏选择十二时辰或精确时间</span>
          <span className={`mt-0.5 block text-sm ${formatted ? "text-[#f4efe5]" : "text-[#5f5b53]"}`}>
            {formatted || "请选择出生时辰"}
          </span>
        </span>
        <ChevronDown size={17} className="shrink-0 text-[#777168] transition group-hover:text-[#79b8b1]" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open ? (
          <BirthTimeDialog value={value} onConfirm={onChange} onClose={() => setOpen(false)} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
