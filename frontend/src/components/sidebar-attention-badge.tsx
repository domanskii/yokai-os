"use client";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
} from "lucide-react";

export function SidebarAttentionBadge() {
  const [
    count,
    setCount,
  ] = useState(0);

  const [
    overdue,
    setOverdue,
  ] = useState(0);

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    let cancelled =
      false;

    const load =
      async () => {
        try {
          const response =
            await fetch(
              "/api/dashboard/today",
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
                cache:
                  "no-store",
              }
            );

          if (
            !response.ok
          ) {
            return;
          }

          const data =
            await response.json();

          if (
            cancelled
          ) {
            return;
          }

          setCount(
            Number(
              data?.stats
                ?.attention_count
              || 0
            )
          );

          setOverdue(
            Number(
              data?.stats
                ?.overdue
              || 0
            )
          );
        } catch {
          // Badge nie powinien wpływać
          // na działanie menu.
        }
      };

    void load();

    const interval =
      window.setInterval(
        () =>
          void load(),
        60000
      );

    return () => {
      cancelled =
        true;

      window.clearInterval(
        interval
      );
    };
  }, []);

  if (
    count <= 0
  ) {
    return null;
  }

  return (
    <div className="px-3 pt-3">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.045] px-3 py-2.5 text-xs text-amber-100 transition hover:bg-amber-400/[.075]"
      >
        <AlertTriangle className="size-4 shrink-0" />

        <span className="min-w-0 flex-1">
          Wymaga uwagi
        </span>

        <span className="rounded-full bg-amber-300/15 px-2 py-0.5 font-semibold">
          {count}
        </span>

        {overdue > 0 && (
          <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-red-200">
            {overdue}
          </span>
        )}
      </Link>
    </div>
  );
}
