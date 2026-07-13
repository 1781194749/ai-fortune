import { Lunar, LunarYear, Solar } from "lunar-typescript";

export type BirthCalendarType = "solar" | "lunar" | "yinli";
export type BirthDateValues = Partial<Record<BirthCalendarType, string>>;

export const birthCalendarOptions = [
  {
    value: "solar",
    label: "公历",
    english: "Gregorian",
    description: "按固定月份记录",
  },
  {
    value: "lunar",
    label: "农历",
    english: "Lunisolar",
    description: "含节气与闰月",
  },
  {
    value: "yinli",
    label: "阴历",
    english: "Lunar",
    description: "按月相周期记录",
  },
] as const satisfies ReadonlyArray<{
  value: BirthCalendarType;
  label: string;
  english: string;
  description: string;
}>;

export type DateParts = {
  year: number;
  month: number;
  day: number;
};

export type LunarMonthOption = {
  value: number;
  label: string;
  days: number;
  leap: boolean;
};

export function switchBirthCalendarValue(input: {
  currentType: BirthCalendarType;
  currentValue: string;
  values: BirthDateValues;
  nextType: BirthCalendarType;
}) {
  const values = {
    ...input.values,
    [input.currentType]: input.currentValue,
  };
  const canReuseCanonicalDate = input.currentType !== "yinli" && input.nextType !== "yinli";
  const nextValue = values[input.nextType] ?? (canReuseCanonicalDate ? input.currentValue : "");

  return {
    value: nextValue,
    values: {
      ...values,
      [input.nextType]: nextValue,
    },
  };
}

const ymdPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeBirthCalendarType(value: string | null | undefined): BirthCalendarType {
  if (value === "lunar" || value === "yinli") {
    return value;
  }

  return "solar";
}

export function parseYmd(value: string | null | undefined): DateParts | null {
  const match = value?.match(ymdPattern);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return { year, month, day };
}

export function toYmd(parts: DateParts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getSolarMonthDayCount(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getLunarMonths(year: number): LunarMonthOption[] {
  try {
    return LunarYear.fromYear(year)
      .getMonthsInYear()
      .map((month) => {
        const value = month.getMonth();
        const lunar = Lunar.fromYmd(year, value, 1);

        return {
          value,
          label: `${lunar.getMonthInChinese()}月`,
          days: month.getDayCount(),
          leap: month.isLeap(),
        };
      });
  } catch {
    return [];
  }
}

export function getLunarPartsFromSolar(value: string | null | undefined): DateParts | null {
  const parts = parseYmd(value);

  if (!parts) {
    return null;
  }

  try {
    const lunar = Solar.fromYmd(parts.year, parts.month, parts.day).getLunar();

    return {
      year: lunar.getYear(),
      month: lunar.getMonth(),
      day: lunar.getDay(),
    };
  } catch {
    return null;
  }
}

export function lunarPartsToSolarYmd(parts: DateParts) {
  try {
    return Lunar.fromYmd(parts.year, parts.month, parts.day).getSolar().toYmd();
  } catch {
    return "";
  }
}

export function getBirthCalendarLabel(value: string | null | undefined) {
  const type = normalizeBirthCalendarType(value);
  return birthCalendarOptions.find((option) => option.value === type)?.label ?? "公历";
}

export function formatBirthDate(
  value: string | null | undefined,
  calendarType: string | null | undefined,
) {
  const parts = parseYmd(value);

  if (!parts) {
    return "";
  }

  const type = normalizeBirthCalendarType(calendarType);

  if (type === "lunar") {
    try {
      const lunar = Solar.fromYmd(parts.year, parts.month, parts.day).getLunar();
      return `农历 ${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
    } catch {
      return "";
    }
  }

  if (type === "yinli") {
    return `阴历 ${parts.year}年 · 第${parts.month}月 · 第${parts.day}日`;
  }

  return `公历 ${parts.year}年${parts.month}月${parts.day}日`;
}
