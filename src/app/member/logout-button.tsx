"use client";

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton({ variant = "pill" }: { variant?: "pill" | "menu" | "icon" }) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        setLoggingOut(false);
        return;
      }

      window.location.replace("/");
    } catch {
      setLoggingOut(false);
    }
  }

  const className =
    variant === "menu"
      ? "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-[#c8d0dc] transition hover:bg-[#191d24] hover:text-[#efd9a6] disabled:cursor-wait disabled:opacity-60"
      : variant === "icon"
        ? "inline-flex size-9 items-center justify-center rounded-md text-[#8d98a8] transition hover:bg-[#171a20] hover:text-[#efd9a6] disabled:cursor-wait disabled:opacity-60"
      : "inline-flex h-10 items-center gap-2 rounded-full border border-[#34352e] bg-[#11120f] px-3 text-sm text-[#aaa294] transition hover:border-[#c9a35f]/50 hover:text-[#efd9a6] disabled:cursor-wait disabled:opacity-60 sm:px-4";

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loggingOut}
      className={className}
      aria-label="退出登录"
      title="退出登录"
    >
      {loggingOut ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
      <span className={variant === "icon" ? "sr-only" : undefined}>{loggingOut ? "正在退出" : "退出登录"}</span>
    </button>
  );
}
