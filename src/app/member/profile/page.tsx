import Link from "next/link";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Clock3,
  HeartHandshake,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  UserRound,
} from "lucide-react";
import { formatBirthDate } from "@/lib/birth-calendar";
import { getFortuneProfile, listFortuneProfiles } from "@/lib/fortune-profile-store";
import { getRequiredMemberSession } from "../member-data";

type ProfileSearchParams = Promise<{
  subjectKey?: string | string[];
}>;

function getFirstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getProfileHref(subjectKey: string) {
  return subjectKey === "self"
    ? "/member/profile"
    : `/member/profile?subjectKey=${encodeURIComponent(subjectKey)}`;
}

function getEditHref(subjectKey: string) {
  return subjectKey === "self"
    ? "/onboarding?edit=1"
    : `/onboarding?subjectKey=${encodeURIComponent(subjectKey)}&edit=1`;
}

function ProfileDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_6rem_minmax(0,1fr)] items-start gap-3 border-b border-[#242932] py-4 last:border-b-0 sm:grid-cols-[1.25rem_7rem_minmax(0,1fr)]">
      <Icon size={16} className="mt-0.5 text-[#6f7a8a]" aria-hidden="true" />
      <dt className="text-sm text-[#7f8998]">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-[#d7dee8]">{value || "待补充"}</dd>
    </div>
  );
}

export default async function MemberProfilePage({
  searchParams,
}: {
  searchParams: ProfileSearchParams;
}) {
  const session = await getRequiredMemberSession();
  const [selfProfile, profiles, query] = await Promise.all([
    getFortuneProfile(session.userId),
    listFortuneProfiles(session.userId),
    searchParams,
  ]);
  const requestedSubjectKey = getFirstValue(query.subjectKey);
  const selectedProfile = requestedSubjectKey
    ? profiles.find((item) => item.subjectKey === requestedSubjectKey) ?? selfProfile
    : selfProfile ?? profiles[0] ?? null;
  const profileLimit = session.profileLimit ?? 3;
  const canAddProfile = profiles.length < profileLimit;
  const birthSummary = formatBirthDate(
    selectedProfile?.birthDate,
    selectedProfile?.calendarType,
  );
  const identitySummary = [
    birthSummary,
    selectedProfile?.birthTime || null,
    selectedProfile?.birthPlace || null,
  ].filter(Boolean).join(" · ");

  if (!selectedProfile) {
    return (
      <section className="mx-auto flex min-h-[62vh] max-w-3xl flex-col justify-center border-b border-[#252a32] py-16 sm:py-24">
        <p className="flex items-center gap-2 text-sm text-[#c9a35f]">
          <UserRound size={16} aria-hidden="true" />
          我的档案
        </p>
        <h1 className="mt-5 font-ritual text-3xl text-[#f4efe5] sm:text-4xl">
          建立第一份命理档案
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#8d98a8]">
          记录你的出生信息、当下状态和长期关注，让每一次问事都从你真实的处境开始。
        </p>
        <Link
          href="/onboarding?edit=1"
          className="mt-8 inline-flex h-10 w-fit items-center gap-2 rounded-md bg-[#c9a35f] px-4 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
        >
          <Plus size={16} aria-hidden="true" />
          开始填写
        </Link>
      </section>
    );
  }

  const isSelf = selectedProfile.subjectKey === "self";
  const displayName = selectedProfile.name || "未命名档案";

  return (
    <div className="mx-auto max-w-6xl">
      <section className="border-b border-[#252a32] pb-9 sm:pb-11">
        <div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-[#3b382f] bg-[#15140f] font-ritual text-2xl text-[#d8b873] sm:size-16">
              {displayName.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[#8d98a8]">{isSelf ? "本人档案" : "人物档案"}</p>
              <h1 className="mt-1 truncate font-ritual text-3xl text-[#f4efe5] sm:text-4xl">
                {displayName}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#9ba5b3]">
                {identitySummary || "出生资料待补充"}
              </p>
              <div className="mt-4 flex max-w-sm items-center gap-3">
                <div className="h-1 flex-1 overflow-hidden bg-[#252a32]" aria-hidden="true">
                  <div
                    className="h-full bg-[#c9a35f]"
                    style={{ width: `${selectedProfile.completeness}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-[#7f8998]">
                  完整度 {selectedProfile.completeness}%
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <Link
              href={getEditHref(selectedProfile.subjectKey)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#c9a35f] px-4 text-sm font-medium text-[#17130d] transition hover:bg-[#efd9a6]"
            >
              <Pencil size={15} aria-hidden="true" />
              编辑档案
            </Link>
            <details className="group relative">
              <summary className="flex h-10 list-none items-center gap-2 rounded-md border border-[#303642] px-3 text-sm text-[#c8d0dc] transition hover:border-[#4a5260] hover:text-[#f4efe5] [&::-webkit-details-marker]:hidden">
                切换人物
                <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[#2b3038] bg-[#101318] shadow-[0_20px_60px_rgba(0,0,0,0.48)]">
                <div className="flex items-center justify-between border-b border-[#252a32] px-4 py-3">
                  <span className="text-xs text-[#8d98a8]">人物档案</span>
                  <span className="text-xs text-[#697386]">{profiles.length} / {profileLimit}</span>
                </div>
                <nav className="max-h-72 overflow-y-auto p-2" aria-label="切换人物档案">
                  {profiles.map((item) => {
                    const active = item.subjectKey === selectedProfile.subjectKey;

                    return (
                      <Link
                        key={item.subjectKey}
                        href={getProfileHref(item.subjectKey)}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition ${
                          active
                            ? "bg-[#19160f] text-[#efd9a6]"
                            : "text-[#c8d0dc] hover:bg-[#191d24] hover:text-[#f4efe5]"
                        }`}
                      >
                        <span className="truncate">{item.name || "未命名档案"}</span>
                        <span className="shrink-0 text-[11px] text-[#697386]">
                          {item.subjectKey === "self" ? "本人" : `${item.completeness}%`}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
                {canAddProfile ? (
                  <div className="border-t border-[#252a32] p-2">
                    <Link
                      href="/onboarding?subjectKey=new&edit=1"
                      className="flex h-10 items-center gap-2 rounded-md px-3 text-sm text-[#d8b873] transition hover:bg-[#19160f] hover:text-[#efd9a6]"
                    >
                      <Plus size={15} aria-hidden="true" />
                      新增人物档案
                    </Link>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="grid gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-12">
        <div>
          <h2 className="font-ritual text-xl text-[#f4efe5]">出生资料</h2>
          <dl className="mt-4">
            <ProfileDetail icon={CalendarDays} label="出生日期" value={birthSummary} />
            <ProfileDetail icon={Clock3} label="出生时辰" value={selectedProfile.birthTime} />
            <ProfileDetail icon={MapPin} label="出生地点" value={selectedProfile.birthPlace} />
            <ProfileDetail icon={UserRound} label="性别" value={selectedProfile.gender} />
          </dl>
        </div>

        <div>
          <h2 className="font-ritual text-xl text-[#f4efe5]">当下近况</h2>
          <dl className="mt-4">
            <ProfileDetail
              icon={HeartHandshake}
              label="关系状态"
              value={selectedProfile.relationshipStatus}
            />
            <ProfileDetail
              icon={BriefcaseBusiness}
              label="事业与身份"
              value={selectedProfile.careerFocus}
            />
            <ProfileDetail icon={Sparkles} label="生肖" value={selectedProfile.zodiac} />
          </dl>
        </div>
      </section>

      <section className="grid border-t border-[#252a32] py-10 lg:grid-cols-[0.78fr_1.22fr] lg:py-12">
        <div className="pb-10 lg:pb-0 lg:pr-14">
          <h2 className="font-ritual text-xl text-[#f4efe5]">长期关注</h2>
          {selectedProfile.recurringTopics.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedProfile.recurringTopics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-md border border-[#3c8b72]/28 bg-[#3c8b72]/8 px-2.5 py-1.5 text-sm text-[#8ad5bd]"
                >
                  {topic}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#7f8998]">还没有记录长期关注的主题。</p>
          )}
        </div>

        <div className="border-t border-[#252a32] pt-10 lg:border-l lg:border-t-0 lg:pl-14 lg:pt-0">
          <h2 className="font-ritual text-xl text-[#f4efe5]">玄机记得的你</h2>
          <blockquote className="mt-5 border-l-2 border-[#c9a35f]/55 pl-5 text-base leading-8 text-[#c8d0dc] sm:text-lg">
            {selectedProfile.memorySummary || "随着相处与问事，这里会慢慢留下更贴近你的长期脉络。"}
          </blockquote>
        </div>
      </section>
    </div>
  );
}
