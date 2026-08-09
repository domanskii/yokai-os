"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Download,
  FileBarChart,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { ControlSuiteNav } from "../../components/control-suite-nav";

type ClientRow = {
  client: string;
  orders: number;
  turnover: number;
  profit: number;
};

type SourceRow = {
  source: string;
  orders: number;
  turnover: number;
};

type Report = {
  days: number;
  orders_count: number;
  turnover: number;
  paid: number;
  outstanding: number;
  material_cost: number;
  labor_cost: number;
  estimated_profit: number;
  margin_percent: number;
  average_order: number;
  top_clients: ClientRow[];
  sources: SourceRow[];
};

function money(
  value: number
) {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      style: "currency",
      currency: "PLN",
    }
  ).format(
    value || 0
  );
}

export default function ReportsPage() {
  const [days, setDays] =
    useState(30);
  const [data, setData] =
    useState<Report | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);
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
      setError("");

      try {
        const response =
          await fetch(
            `/api/reports/overview?days=${days}`,
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
            "Nie udało się pobrać raportu"
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
    [
      days,
    ]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv =
    async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        return;
      }

      const response =
        await fetch(
          `/api/reports/export.csv?days=${days}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        setError(
          "Nie udało się wyeksportować CSV"
        );
        return;
      }

      const url =
        URL.createObjectURL(
          await response.blob()
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        `yokai-report-${days}d.csv`;

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      URL.revokeObjectURL(
        url
      );
    };

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-6 text-white lg:pl-[282px] lg:pr-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <FileBarChart className="size-4" />
              ANALITYKA
            </div>

            <h1 className="mt-2 text-3xl font-semibold">
              Raporty
            </h1>

            <div className="mt-2 text-sm text-white/35">
              Sprzedaż, zysk, koszty, klienci i źródła zamówień.
            </div>
          </div>

          <ControlSuiteNav
            active="/reports"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {[7,30,90,365].map(
            (value) => (
              <button
                key={value}
                onClick={() =>
                  setDays(value)
                }
                className={`h-10 rounded-xl border px-3 text-sm ${
                  days === value
                    ? "border-violet-400/25 bg-violet-500/[.10] text-white"
                    : "border-white/[.06] bg-white/[.02] text-white/35"
                }`}
              >
                {value}d
              </button>
            )
          )}

          <button
            onClick={() =>
              void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[.06] bg-white/[.02] px-3 text-sm text-white/40"
          >
            <RefreshCw className="size-4" />
            Odśwież
          </button>

          <button
            onClick={() =>
              void exportCsv()
            }
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-3 text-sm font-semibold"
          >
            <Download className="size-4" />
            Eksport CSV
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[.05] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-5 grid min-h-[420px] place-items-center rounded-3xl border border-white/[.06] bg-white/[.02]">
            <LoaderCircle className="size-7 animate-spin text-white/20" />
          </div>
        ) : data ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Obrót",
                  money(
                    data.turnover
                  ),
                ],
                [
                  "Szacowany zysk",
                  money(
                    data.estimated_profit
                  ),
                ],
                [
                  "Średnie zamówienie",
                  money(
                    data.average_order
                  ),
                ],
                [
                  "Marża",
                  `${data.margin_percent.toFixed(1)}%`,
                ],
                [
                  "Wpłacono",
                  money(
                    data.paid
                  ),
                ],
                [
                  "Do zapłaty",
                  money(
                    data.outstanding
                  ),
                ],
                [
                  "Materiały",
                  money(
                    data.material_cost
                  ),
                ],
                [
                  "Praca",
                  money(
                    data.labor_cost
                  ),
                ],
              ].map(
                ([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4"
                  >
                    <div className="text-xs text-white/30">
                      {label}
                    </div>

                    <div className="mt-2 text-xl font-semibold">
                      {value}
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
                <div className="border-b border-white/[.06] p-5">
                  <div className="font-semibold">
                    Najlepsi klienci
                  </div>
                </div>

                <div className="divide-y divide-white/[.05]">
                  {data.top_clients.map(
                    (
                      row
                    ) => (
                      <div
                        key={row.client}
                        className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 text-sm"
                      >
                        <div className="truncate text-white/60">
                          {row.client}
                        </div>

                        <div className="text-white/35">
                          {row.orders} zam.
                        </div>

                        <div className="font-semibold text-emerald-200/80">
                          {money(
                            row.turnover
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
                <div className="border-b border-white/[.06] p-5">
                  <div className="font-semibold">
                    Źródła zamówień
                  </div>
                </div>

                <div className="divide-y divide-white/[.05]">
                  {data.sources.map(
                    (
                      row
                    ) => (
                      <div
                        key={row.source}
                        className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3 text-sm"
                      >
                        <div className="truncate text-white/60">
                          {row.source}
                        </div>

                        <div className="text-white/35">
                          {row.orders} zam.
                        </div>

                        <div className="font-semibold text-violet-200/80">
                          {money(
                            row.turnover
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
