import type { ReactNode } from "react";
import { MemberNav } from "./member-nav";
import { getMemberShellData } from "./member-data";

export default async function MemberLayout({ children }: { children: ReactNode }) {
  const { session, canAccessAdmin, membership, isFree } = await getMemberShellData();

  return (
    <main className="min-h-screen bg-[#090b0e] text-[#e8edf4]">
      <div className="min-h-screen w-full">
        <MemberNav
          emailMasked={session.emailMasked}
          tierLabel={membership.label}
          starBalance={session.starBalance}
          chatQuota={session.chatQuota ?? 10}
          chatUsed={session.chatUsed ?? 0}
          canAccessAdmin={canAccessAdmin}
          isFree={isFree}
        />

        <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          {children}
        </div>
      </div>
    </main>
  );
}
