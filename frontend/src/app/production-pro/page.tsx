"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Clock3,
  LoaderCircle,
  PackageOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  WalletCards,
  Zap,
} from "lucide-react";

type Material = {
  id: number;
  name: string;
  color_name?: string | null;
  stock_length_m: number;
  cost_per_m: number;
};

type Usage = {
  id: number;
  material_id: number;
  material_name: string;
  color_name?: string | null;
  used_length_m: number;
  cost_total: number;
};

type Session = {
  id: number;
  order_id: number;
  started_at: string;
  finished_at?: string | null;
  duration_seconds: number;
  material_cost_live?: number;
  material_cost?: number;
  labor_cost?: number;
  revenue?: number;
  profit?: number;
  material_usage: Usage[];
  order_number?: string;
};

type Order = {
  id: number;
  order_number?: string;
  name?: string;
  client_name?: string;
  status?: string;
  price?: number;
  deadline?: string | null;
  priority?: string | null;
  active_session?: Session | null;
};

type Board = {
  orders: Order[];
  materials: Material[];
  history: Session[];
};

function money(value: number | undefined) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value || 0);
}

function duration(seconds: number) {
  const total = Math.max(
    Math.floor(seconds || 0),
    0
  );

  const h = Math.floor(total / 3600);
  const m = Math.floor(
    (total % 3600) / 60
  );
  const s = total % 60;

  return [
    h > 0 ? `${h}h` : null,
    `${m}m`,
    `${s}s`,
  ]
    .filter(Boolean)
    .join(" ");
}

function useLiveSeconds(
  startedAt?: string
) {
  const [seconds, setSeconds] =
    useState(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }

    const tick = () => {
      const start = new Date(
        startedAt
      ).getTime();

      setSeconds(
        Math.max(
          Math.floor(
            (Date.now() - start)
              / 1000
          ),
          0
        )
      );
    };

    tick();

    const timer =
      window.setInterval(
        tick,
        1000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [startedAt]);

  return seconds;
}

async function api(
  path: string,
  options?: RequestInit
) {
  const token =
    localStorage.getItem(
      "yokai_token"
    );

  const response = await fetch(
    `/api${path}`,
    {
      ...options,
      headers: {
        Authorization:
          `Bearer ${token}`,
        "Content-Type":
          "application/json",
        ...(options?.headers
          || {}),
      },
    }
  );

  if (!response.ok) {
    const body =
      await response.json()
      .catch(() => ({}));

    throw new Error(
      body.detail
      || `HTTP ${response.status}`
    );
  }

  return response.json();
}

function ProductionOrderCard({
  order,
  materials,
  onRefresh,
}: {
  order: Order;
  materials: Material[];
  onRefresh: () => Promise<void>;
}) {
  const [materialId, setMaterialId] =
    useState(
      materials[0]?.id
        ? String(
            materials[0].id
          )
        : ""
    );

  const [used, setUsed] =
    useState("0.10");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const liveSeconds =
    useLiveSeconds(
      order.active_session
        ?.started_at
    );

  const run =
    async (
      action: () => Promise<any>
    ) => {
      setBusy(true);
      setError("");

      try {
        await action();
        await onRefresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setBusy(false);
      }
    };

  return (
    <div className="rounded-3xl border border-white/[.06] bg-[#0e131a] p-5">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/orders/${order.id}`}
              className="font-semibold text-white hover:text-violet-200"
            >
              {order.order_number
                || `#${order.id}`}
            </Link>

            <span className="rounded-lg border border-white/[.07] bg-white/[.025] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/35">
              {order.status || "—"}
            </span>
          </div>

          <div className="mt-2 text-sm text-white/60">
            {order.name
              || "Zamówienie"}
          </div>

          <div className="mt-1 text-xs text-white/28">
            {order.client_name
              || "Bez klienta"}
            {" · "}
            {money(order.price)}
          </div>
        </div>

        {order.active_session ? (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.04] px-3 py-2">
            <Clock3 className="size-4 text-emerald-300" />

            <span className="font-mono text-sm font-semibold text-emerald-100">
              {duration(
                liveSeconds
              )}
            </span>
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  api(
                    `/production-pro/orders/${order.id}/start`,
                    {
                      method:
                        "POST",
                    }
                  )
              )
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}

            Rozpocznij
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/15 bg-red-400/[.04] px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {order.active_session && (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_130px_auto]">
            <select
              value={materialId}
              onChange={(e) =>
                setMaterialId(
                  e.target.value
                )
              }
              className="h-11 rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm text-white outline-none"
            >
              {materials.map(
                (
                  material
                ) => (
                  <option
                    key={
                      material.id
                    }
                    value={
                      material.id
                    }
                  >
                    {material.name}
                    {material.color_name
                      ? ` · ${material.color_name}`
                      : ""}
                    {` · ${material.stock_length_m.toFixed(2)} m`}
                  </option>
                )
              )}
            </select>

            <input
              value={used}
              onChange={(e) =>
                setUsed(
                  e.target.value
                )
              }
              inputMode="decimal"
              className="h-11 rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm outline-none"
              placeholder="metry"
            />

            <button
              disabled={
                busy
                || !materialId
              }
              onClick={() =>
                void run(
                  () =>
                    api(
                      `/production-pro/orders/${order.id}/material`,
                      {
                        method:
                          "POST",
                        body:
                          JSON.stringify(
                            {
                              material_id:
                                Number(
                                  materialId
                                ),
                              used_length_m:
                                Number(
                                  used.replace(
                                    ",",
                                    "."
                                  )
                                ),
                            }
                          ),
                      }
                    )
                )
              }
              className="h-11 rounded-xl border border-white/[.08] bg-white/[.035] px-4 text-sm font-semibold text-white/70 disabled:opacity-40"
            >
              Dodaj zużycie
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {order.active_session.material_usage.length === 0 ? (
              <div className="rounded-xl border border-white/[.05] px-3 py-3 text-xs text-white/25">
                Nie dodano jeszcze materiałów.
              </div>
            ) : (
              order.active_session.material_usage.map(
                (usage) => (
                  <div
                    key={usage.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-white/[.05] bg-white/[.015] px-3 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="text-xs text-white/55">
                      {usage.material_name}
                      {usage.color_name
                        ? ` · ${usage.color_name}`
                        : ""}
                      {" · "}
                      <b className="text-white/75">
                        {Number(
                          usage.used_length_m
                        ).toFixed(3)}
                        {" m"}
                      </b>
                      {" · "}
                      {money(
                        usage.cost_total
                      )}
                    </div>

                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            api(
                              `/production-pro/material-usage/${usage.id}`,
                              {
                                method:
                                  "DELETE",
                              }
                            )
                        )
                      }
                      className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/65"
                    >
                      <RotateCcw className="size-3.5" />
                      Cofnij
                    </button>
                  </div>
                )
              )
            )}
          </div>

          <div className="mt-5 flex flex-col justify-between gap-4 border-t border-white/[.06] pt-4 sm:flex-row sm:items-center">
            <div className="text-xs text-white/30">
              Materiały:{" "}
              <b className="text-white/60">
                {money(
                  order.active_session
                    .material_cost_live
                )}
              </b>
            </div>

            <button
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    api(
                      `/production-pro/orders/${order.id}/finish`,
                      {
                        method:
                          "POST",
                        body:
                          JSON.stringify(
                            {
                              notes:
                                null,
                            }
                          ),
                      }
                    )
                )
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold disabled:opacity-50"
            >
              <Square className="size-4" />
              Zakończ produkcję
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ProductionProPage() {
  const [data, setData] =
    useState<Board | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          setData(
            await api(
              "/production-pro/board"
            )
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

  const activeOrders =
    useMemo(
      () =>
        data?.orders.filter(
          (order) =>
            Boolean(
              order.active_session
            )
        ) || [],
      [data]
    );

  const waitingOrders =
    useMemo(
      () =>
        data?.orders.filter(
          (order) =>
            !order.active_session
        ) || [],
      [data]
    );

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-6 text-white lg:pl-[282px] lg:pr-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <Zap className="size-4" />
              PRODUKCJA PRO
            </div>

            <h1 className="mt-2 text-3xl font-semibold">
              Realny czas, materiał i zysk
            </h1>

            <div className="mt-2 text-sm text-white/35">
              Startujesz produkcję, zapisujesz zużycie folii i kończysz. Magazyn schodzi automatycznie.
            </div>
          </div>

          <button
            onClick={() =>
              void load()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.02] px-3 text-sm text-white/45"
          >
            <RefreshCw className="size-4" />
            Odśwież
          </button>
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
                  W produkcji
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {activeOrders.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4">
                <div className="text-xs text-white/30">
                  Oczekujące
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {waitingOrders.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4">
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <PackageOpen className="size-3.5" />
                  Materiały
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.materials.length}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4">
                <div className="flex items-center gap-2 text-xs text-white/30">
                  <WalletCards className="size-3.5" />
                  Ostatnie sesje
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {data.history.length}
                </div>
              </div>
            </div>

            {activeOrders.length > 0 && (
              <section className="mt-6">
                <h2 className="text-sm font-semibold uppercase tracking-[.14em] text-emerald-200/60">
                  Teraz produkujesz
                </h2>

                <div className="mt-3 grid gap-4 xl:grid-cols-2">
                  {activeOrders.map(
                    (order) => (
                      <ProductionOrderCard
                        key={order.id}
                        order={order}
                        materials={data.materials}
                        onRefresh={load}
                      />
                    )
                  )}
                </div>
              </section>
            )}

            <section className="mt-7">
              <h2 className="text-sm font-semibold uppercase tracking-[.14em] text-white/35">
                Kolejka
              </h2>

              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                {waitingOrders.map(
                  (order) => (
                    <ProductionOrderCard
                      key={order.id}
                      order={order}
                      materials={data.materials}
                      onRefresh={load}
                    />
                  )
                )}
              </div>
            </section>

            <section className="mt-7 overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
              <div className="border-b border-white/[.06] p-5 font-semibold">
                Ostatnio zakończone
              </div>

              {data.history.length === 0 ? (
                <div className="p-5 text-sm text-white/25">
                  Brak zakończonych sesji.
                </div>
              ) : (
                <div className="divide-y divide-white/[.05]">
                  {data.history.map(
                    (session) => (
                      <div
                        key={session.id}
                        className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_auto_auto_auto_auto]"
                      >
                        <div>
                          <Link
                            href={`/orders/${session.order_id}`}
                            className="font-semibold text-white/70"
                          >
                            {session.order_number
                              || `#${session.order_id}`}
                          </Link>
                        </div>

                        <div className="text-white/35">
                          {duration(
                            session.duration_seconds
                          )}
                        </div>

                        <div className="text-white/35">
                          materiał{" "}
                          {money(
                            session.material_cost
                          )}
                        </div>

                        <div className="text-white/35">
                          praca{" "}
                          {money(
                            session.labor_cost
                          )}
                        </div>

                        <div
                          className={`font-semibold ${
                            Number(
                              session.profit
                              || 0
                            ) >= 0
                              ? "text-emerald-200/80"
                              : "text-red-200/80"
                          }`}
                        >
                          {money(
                            session.profit
                          )}
                        </div>
                      </div>
                    )
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
