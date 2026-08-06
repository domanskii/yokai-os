"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  CheckCircle2,
  FileImage,
} from "lucide-react";

type Summary = {
  total: number;
  ready_count: number;
  has_ready: boolean;
  ready_name: string | null;
};

const cache =
  new Map<number, Summary>();

export function ProductionSvgBadge({
  orderId,
}: {
  orderId: number;
}) {
  const [summary, setSummary] =
    useState<Summary | null>(
      cache.get(orderId) || null
    );

  useEffect(() => {
    if (cache.has(orderId)) return;

    const token =
      localStorage.getItem("yokai_token");

    if (!token) return;

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/orders/${orderId}/svg-summary`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) return;

        const data: Summary =
          await response.json();

        cache.set(orderId, data);

        if (!cancelled) {
          setSummary(data);
        }
      } catch {
        // Badge nie blokuje produkcji.
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!summary) return null;

  if (summary.has_ready) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[.07] px-2 py-0.5 text-[10px] text-emerald-200"
        title={summary.ready_name || "Plik produkcyjny"}
      >
        <CheckCircle2 className="size-3" />
        SVG gotowy
      </span>
    );
  }

  if (summary.total > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/20 bg-violet-400/[.07] px-2 py-0.5 text-[10px] text-violet-200">
        <FileImage className="size-3" />
        SVG {summary.total}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/[.08] bg-white/[.025] px-2 py-0.5 text-[10px] text-white/30">
      <FileImage className="size-3" />
      Brak SVG
    </span>
  );
}
