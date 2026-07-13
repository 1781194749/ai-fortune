import type { ReactNode } from "react";
import { MemberNav, MemberTopActions } from "./member-nav";
import { getMemberShellData } from "./member-data";

export default async function MemberLayout({ children }: { children: ReactNode }) {
  const { session, canAccessAdmin, membership, isFree } = await getMemberShellData();

  return (
    <main className="min-h-screen bg-[#090b0e] text-[#e8edf4]">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <MemberNav
          emailMasked={session.emailMasked}
          tierLabel={membership.label}
          starBalance={session.starBalance}
          canAccessAdmin={canAccessAdmin}
        />

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-[#20252d] bg-[#090b0e]/88 backdrop-blur-xl">
            <div className="flex min-h-16 flex-col justify-between gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:px-8">
              <div className="min-w-0">
                <p className="text-xs text-[#697386]">个人账户</p>
                <p className="mt-1 truncate text-xl font-semibold tracking-tight text-[#f4efe5]">个人中心</p>
              </div>
              <MemberTopActions isFree={isFree} />
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
