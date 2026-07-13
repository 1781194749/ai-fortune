"use client";

import { useEffect } from "react";

export function ReportAutoRefresh({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      window.location.reload();
    }, 3500);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled]);

  return null;
}
