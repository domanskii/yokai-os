"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock3,
  Flame,
  LoaderCircle,
} from "lucide-react";

type PlanningOrder = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  status: string;
  deadline:
    | string
    | null;
  priority:
    | "low"
    | "normal"
    | "high"
    | "urgent";
  production_bucket:
    | "today"
    | "tomorrow"
    | "later";
  price: number;
  is_overdue: boolean;
};

const BUCKETS = [
  {
    value: "today",
    label: "Dzisiaj",
    icon: Flame,
  },
  {
    value: "tomorrow",
    label: "Jutro",
    icon: CalendarDays,
  },
  {
    value: "later",
    label: "Później",
    icon: Clock3,
  },
] as const;

const PRIORITY = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
  urgent: "Pilny",
};

function formatDeadline(
  value:
    | string
    | null
) {
  if (!value) {
    return "bez terminu";
  }

  try {
    return new Intl.DateTimeFormat(
      "pl-PL",
      {
        day: "2-digit",
        month: "short",
      }
    ).format(
      new Date(
        `${String(value).slice(0, 10)}T12:00:00`
      )
    );
  } catch {
    return String(value);
  }
}

export function ProductionPlanningOverview() {
  const [
    orders,
    setOrders,
  ] = useState<
    PlanningOrder[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setLoading(false);
      return;
    }

    const load =
      async () => {
        try {
          const response =
            await fetch(
              "/api/production/planning",
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
            throw new Error();
          }

          setOrders(
            await response.json()
          );
        } catch {
          setError(
            "Nie udało się pobrać planu produkcji"
          );
        } finally {
          setLoading(
            false
          );
        }
      };

    void load();
  }, []);

  const overdue =
    useMemo(
      () =>
        orders.filter(
          (order) =>
            order.is_overdue
        ),
      [orders]
    );

  if (loading) {
    return (
      <section className="surface-card mt-5 grid min-h-[180px] place-items-center">
        <LoaderCircle className="size-6 animate-spin text-white/25" />
      </section>
    );
  }

  return (
    <section className="surface-card mt-5 overflow-hidden lg:ml-[250px] lg:mr-5">
      <div className="flex flex-col justify-between gap-3 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <CalendarDays className="size-5 text-violet-300" />
            Plan produkcji
          </div>

          <div className="mt-1 text-xs text-white/35">
            Zamówienia przypisane na dziś, jutro i później. Priorytet i termin ustawiasz na karcie zamówienia.
          </div>
        </div>

        {overdue.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/[.07] px-3 py-2 text-xs font-semibold text-red-200">
            <AlertTriangle className="size-4" />
            Opóźnione: {overdue.length}
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-red-400/15 bg-red-400/[.05] px-5 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 p-5 xl:grid-cols-3">
        {BUCKETS.map(
          (bucket) => {
            const Icon =
              bucket.icon;

            const bucketOrders =
              orders.filter(
                (order) =>
                  order.production_bucket
                  === bucket.value
              );

            return (
              <div
                key={
                  bucket.value
                }
                className="overflow-hidden rounded-3xl border border-white/[.065] bg-white/[.018]"
              >
                <div className="flex items-center justify-between border-b border-white/[.055] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-violet-300" />
                    {bucket.label}
                  </div>

                  <span className="rounded-full bg-white/[.04] px-2.5 py-1 text-xs text-white/40">
                    {bucketOrders.length}
                  </span>
                </div>

                {bucketOrders.length
                  === 0 ? (
                  <div className="px-4 py-10 text-center text-xs text-white/25">
                    Brak zadań
                  </div>
                ) : (
                  <div className="divide-y divide-white/[.05]">
                    {bucketOrders
                      .slice(
                        0,
                        12
                      )
                      .map(
                        (
                          order
                        ) => (
                          <Link
                            key={
                              order.id
                            }
                            href={`/orders/${order.id}`}
                            className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[.025]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium text-white/85">
                                  {order.order_number}
                                  {" · "}
                                  {order.name}
                                </span>

                                {order.priority
                                  !== "normal" && (
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                    order.priority
                                      === "urgent"
                                      ? "border-red-400/25 bg-red-400/[.07] text-red-200"
                                      : order.priority
                                          === "high"
                                        ? "border-amber-400/25 bg-amber-400/[.07] text-amber-200"
                                        : "border-white/[.08] text-white/35"
                                  }`}>
                                    {PRIORITY[
                                      order.priority
                                    ]}
                                  </span>
                                )}

                                {order.is_overdue && (
                                  <span className="rounded-full border border-red-400/25 bg-red-400/[.07] px-2 py-0.5 text-[10px] text-red-200">
                                    po terminie
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 truncate text-[11px] text-white/28">
                                {order.client_name}
                                {" · "}
                                {order.status}
                                {" · "}
                                {formatDeadline(
                                  order.deadline
                                )}
                              </div>
                            </div>

                            <ChevronRight className="size-4 shrink-0 text-white/20" />
                          </Link>
                        )
                      )}
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>
    </section>
  );
}
