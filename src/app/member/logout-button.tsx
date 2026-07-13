"use client";

import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton({ variant = "pill" }: { variant?: "pill" | "menu" }) {
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
      ? "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#c8c0b2] transition hover:bg-[#191a16] hover:text-[#efd9a6] disabled:cursor-wait disabled:opacity-60"
      : "inline-flex h-10 items-center gap-2 rounded-full border border-[#34352e] bg-[#11120f] px-3 text-sm text-[#aaa294] transition hover:border-[#c9a35f]/50 hover:text-[#efd9a6] disabled:cursor-wait disabled:opacity-60 sm:px-4";

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loggingOut}
      className={className}
      aria-label="退出登录"
    >
      {loggingOut ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <LogOut size={16} aria-hidden="true" />}
      <span>{loggingOut ? "正在退出" : "退出登录"}</span>
    </button>
  );
}
