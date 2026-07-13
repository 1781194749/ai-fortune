"use client";

import { useEffect } from "react";

export function ExperimentExposureTracker({
  experimentKey,
  variant,
}: {
  experimentKey: string;
  variant: string;
}) {
  useEffect(() => {
    const storageKey = `xuanji:${experimentKey}:${variant}:exposed`;

    if (window.localStorage.getItem(storageKey)) {
      return;
    }

    void fetch("/api/experiments/new-user-offer/exposure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentKey, variant }),
    }).then((response) => {
      if (response.ok) {
        window.localStorage.setItem(storageKey, new Date().toISOString());
      }
    });
  }, [experimentKey, variant]);

  return null;
}
