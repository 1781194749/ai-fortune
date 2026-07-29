export type PublicFortuneProfile = {
  subjectKey: string;
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  lunarBirthDate: string | null;
  yinliBirthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  calendarType: string;
  zodiac: string | null;
  recurringTopics: string[];
  relationshipStatus: string | null;
  careerFocus: string | null;
  memorySummary: string | null;
  completeness: number;
};

type PublicFortuneProfileSource = PublicFortuneProfile;

export function toPublicFortuneProfile(
  profile: PublicFortuneProfileSource,
): PublicFortuneProfile {
  return {
    subjectKey: profile.subjectKey,
    name: profile.name,
    gender: profile.gender,
    birthDate: profile.birthDate,
    lunarBirthDate: profile.lunarBirthDate,
    yinliBirthDate: profile.yinliBirthDate,
    birthTime: profile.birthTime,
    birthPlace: profile.birthPlace,
    calendarType: profile.calendarType,
    zodiac: profile.zodiac,
    recurringTopics: [...profile.recurringTopics],
    relationshipStatus: profile.relationshipStatus,
    careerFocus: profile.careerFocus,
    memorySummary: profile.memorySummary,
    completeness: profile.completeness,
  };
}
