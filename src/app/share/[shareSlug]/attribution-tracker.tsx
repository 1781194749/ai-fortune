"use client";

import { useEffect } from "react";

export function AttributionTracker({
  shareSlug,
  source,
}: {
  shareSlug: string;
  source: string;
}) {
  useEffect(() => {
    void fetch(`/api/attribution/share/${shareSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
  }, [shareSlug, source]);

  return null;
}

