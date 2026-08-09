"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { ControlSuiteNav } from "../../components/control-suite-nav";

type Item = {
  type: string;
  severity:
    | "high"
    | "medium"
    | "low";
  title: string;
  message: string;
  order_id?: number | null;
  material_id?: number | null;
};

type Data = {
  count: number;
  severity: {
    high: number;
    medium: number;
    low: number;
  };
  by_type: Record<
    string,
    number
  >;
  items: Item[];
};

const icons:
  Record<
    string,
    any
  > = {
    overdue:
      AlertTriangle,
    unpaid:
      WalletCards,
    missing_svg:
      FileWarning,
    low_stock:
      PackageOpen,
    woo_error:
      ShoppingBag,
  };

export default function NotificationsPage() {
  const [data, setData] =
    useState<Data | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);
  const [filter, setFilter] =
    useState("all");
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response =
          await fetch(
            "/api/notifications",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
              cache:
                "no-store",
            }
          );

        if (!response.ok) {
          throw new Error(
            "Nie udało się pobrać powiadomień"
          );
        }

        setData(
          await response.json()
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    useMemo(() => {
      if (!data) {
        return [];
      }

      if (filter === "all") {
        return data.items;
      }

      return data.items.filter(
        (item) =>
          item.type === filter
      );
    }, [
      data,
      filter,
    ]);

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-6 text-white lg:pl-[282px] lg:pr-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <Bell className="size-4" />
              CENTRUM UWAGI
            </div>

            <h1 className="mt-2 text-3xl font-semibold">
              Powiadomienia
            </h1>

            <div className="mt-2 text-sm text-white/35">
              Sprawy, które wymagają reakcji: terminy, płatności, SVG, magazyn i WooCommerce.
            </div>
          </div>

          <ControlSuiteNav
            active="/notifications"
          />
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[.05] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid min-h-[420px] place-items-center rounded-3xl border border-white/[.06] bg-white/[.02]">
            <LoaderCircle className="size-7 animate-spin text-white/20" />
          </div>
        ) : data ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4">
                <div className="text-xs text-white/30">
                  Łącznie
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.count}
                </div>
              </div>

              <div className="rounded-2xl border border-red-400/12 bg-red-400/[.03] p-4">
                <div className="text-xs text-red-100/40">
                  Pilne
                </div>
                <div className="mt-2 text-2xl font-semibold text-red-100">
                  {data.severity.high}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-400/12 bg-amber-400/[.03] p-4">
                <div className="text-xs text-amber-100/40">
                  Średni priorytet
                </div>
                <div className="mt-2 text-2xl font-semibold text-amber-100">
                  {data.severity.medium}
                </div>
              </div>

              <button
                onClick={() =>
                  void load()
                }
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/[.06] bg-[#0e131a] p-4 text-sm text-white/55 hover:text-white"
              >
                <RefreshCw className="size-4" />
                Odśwież
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                [
                  "all",
                  "Wszystkie",
                ],
                [
                  "overdue",
                  "Po terminie",
                ],
                [
                  "unpaid",
                  "Płatności",
                ],
                [
                  "missing_svg",
                  "Brak SVG",
                ],
                [
                  "low_stock",
                  "Magazyn",
                ],
                [
                  "woo_error",
                  "WooCommerce",
                ],
              ].map(
                ([value, label]) => (
                  <button
                    key={value}
                    onClick={() =>
                      setFilter(
                        value
                      )
                    }
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      filter === value
                        ? "border-violet-400/25 bg-violet-500/[.10] text-white"
                        : "border-white/[.06] bg-white/[.02] text-white/35"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            <section className="mt-4 overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
              {visible.length === 0 ? (
                <div className="grid min-h-[260px] place-items-center text-center">
                  <div>
                    <CheckCircle2 className="mx-auto size-9 text-emerald-300/35" />
                    <div className="mt-3 text-sm font-medium">
                      Brak alertów
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[.05]">
                  {visible.map(
                    (
                      item,
                      index
                    ) => {
                      const Icon =
                        icons[
                          item.type
                        ]
                        || Bell;

                      const content = (
                        <>
                          <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                            item.severity === "high"
                              ? "bg-red-400/[.07] text-red-200"
                              : "bg-amber-400/[.06] text-amber-200"
                          }`}>
                            <Icon className="size-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white/80">
                              {item.title}
                            </div>
                            <div className="mt-1 text-xs text-white/30">
                              {item.message}
                            </div>
                          </div>
                        </>
                      );

                      return item.order_id ? (
                        <Link
                          key={`${item.type}-${item.order_id}-${index}`}
                          href={`/orders/${item.order_id}`}
                          className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[.018]"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div
                          key={`${item.type}-${index}`}
                          className="flex items-center gap-3 px-5 py-4"
                        >
                          {content}
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
