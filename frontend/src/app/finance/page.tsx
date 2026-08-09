"use client";

import { YokaiSidebar } from "../../components/yokai-sidebar";

import { SidebarAttentionBadge } from "../../components/sidebar-attention-badge";

import {
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Clock3,
  FileImage,
  Gauge,
  LoaderCircle,
  Menu,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";

type OrderRow = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  status: string;
  price: number;
  paid_amount: number;
  material_cost: number;
  labor_cost: number;
  estimated_profit: number;
  margin_percent: number;
  deadline:
    | string
    | null;
  priority: string;
  production_bucket: string;
  cost_source: string;
};

type Dashboard = {
  days: number;
  orders_count: number;
  revenue: number;
  paid_amount: number;
  outstanding: number;
  material_cost: number;
  labor_cost: number;
  total_estimated_cost: number;
  estimated_profit: number;
  margin_percent: number;
  planning: {
    today: number;
    tomorrow: number;
    later: number;
    overdue: number;
    urgent: number;
  };
  top_orders: OrderRow[];
  orders: OrderRow[];
  note: string;
};

const nav = [
  {
    label: "Dashboard",
    icon: Gauge,
    href: "/",
  },
  {
    label: "Produkcja",
    icon: Zap,
    href: "/production",
  },
  {
    label: "Zamówienia",
    icon: ShoppingBag,
    href: "/orders",
  },
  {
    label: "Biblioteka SVG",
    icon: FileImage,
    href: "/library",
  },
  {
    label: "Kalkulator",
    icon: CircleDollarSign,
    href: "/calculator",
  },
  {
    label: "Materiały",
    icon: Boxes,
    href: "/materials",
  },
  {
    label: "Klienci",
    icon: Users,
    href: "/clients",
  },
  {
    label: "Finanse",
    icon: BarChart3,
    href: "/finance",
  },
];

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

function number(
  value: number
) {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  ).format(
    value || 0
  );
}

function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <div className="text-xs font-semibold uppercase tracking-[.25em] text-violet-300/70">
          YOKAI
        </div>

        <div className="mt-1 text-xl font-semibold">
          OS
        </div>
      </div>

      <nav className="space-y-1 px-3">
        {nav.map(
          (item) => {
            const Icon =
              item.icon;

            const active =
              item.href
              === "/finance";

            return (
              <Link
                key={
                  item.href
                }
                href={
                  item.href
                }
                onClick={
                  onNavigate
                }
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-violet-500/12 text-violet-100"
                    : "text-white/45 hover:bg-white/[.035] hover:text-white/80"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          }
        )}
      </nav>
      <SidebarAttentionBadge />

      <div className="mt-auto p-5 text-[11px] text-white/20">
        YOKAI WRAP · private system
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [
    days,
    setDays,
  ] = useState(30);

  const [
    data,
    setData,
  ] = useState<
    Dashboard | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setError(
        "Brak aktywnej sesji"
      );

      setLoading(
        false
      );

      return;
    }

    const load =
      async () => {
        setLoading(
          true
        );
        setError("");

        try {
          const response =
            await fetch(
              `/api/finance/dashboard?days=${days}`,
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
            const contentType =
              response.headers.get(
                "content-type"
              ) || "";

            if (
              contentType.includes(
                "application/json"
              )
            ) {
              const body =
                await response.json();

              throw new Error(
                body.detail
                || "Nie udało się pobrać finansów"
              );
            }

            throw new Error(
              "Nie udało się pobrać finansów"
            );
          }

          setData(
            await response.json()
          );
        } catch (
          loadError
        ) {
          setError(
            loadError
              instanceof Error
              ? loadError.message
              : "Nie udało się pobrać finansów"
          );
        } finally {
          setLoading(
            false
          );
        }
      };

    void load();
  }, [days]);

  const stats = data
    ? [
        {
          label: "Obrót",
          value:
            money(
              data.revenue
            ),
          icon: Wallet,
          detail:
            `${data.orders_count} zamówień`,
        },
        {
          label: "Wpłacono",
          value:
            money(
              data.paid_amount
            ),
          icon:
            CircleDollarSign,
          detail:
            `Do zapłaty ${money(data.outstanding)}`,
        },
        {
          label: "Materiały",
          value:
            money(
              data.material_cost
            ),
          icon: Boxes,
          detail:
            "rzeczywiste lub z kalkulatora",
        },
        {
          label: "Praca",
          value:
            money(
              data.labor_cost
            ),
          icon: Clock3,
          detail:
            "z ostatnich kalkulacji",
        },
        {
          label: "Szacowany zysk",
          value:
            money(
              data.estimated_profit
            ),
          icon:
            TrendingUp,
          detail:
            `marża ${number(data.margin_percent)}%`,
        },
        {
          label: "Opóźnione",
          value:
            String(
              data.planning.overdue
            ),
          icon:
            AlertTriangle,
          detail:
            `pilne ${data.planning.urgent}`,
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      <YokaiSidebar />

      {mobileOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() =>
              setMobileOpen(
                false
              )
            }
          />

          <aside className="relative h-full w-[280px] border-r border-white/[.07] bg-[#0b0f15]">
            <button
              onClick={() =>
                setMobileOpen(
                  false
                )
              }
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-xl border border-white/[.07] text-white/50"
            >
              <X className="size-4" />
            </button>

            <Sidebar
              onNavigate={() =>
                setMobileOpen(
                  false
                )
              }
            />
          </aside>
        </div>
      )}

      <main className="min-h-screen lg:pl-[250px]">
        <div className="mx-auto max-w-[1540px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex items-start gap-4">
            <button
              onClick={() =>
                setMobileOpen(
                  true
                )
              }
              className="icon-button mt-1 lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
                Rentowność i przepływ
              </div>

              <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Finanse
                  </h1>

                  <div className="mt-2 text-sm text-white/35">
                    Obrót, koszty materiałów, praca, marża i plan produkcji.
                  </div>
                </div>

                <div className="flex rounded-2xl border border-white/[.07] bg-white/[.025] p-1">
                  {[
                    7,
                    30,
                    90,
                    365,
                  ].map(
                    (value) => (
                      <button
                        key={
                          value
                        }
                        onClick={() =>
                          setDays(
                            value
                          )
                        }
                        className={`rounded-xl px-3 py-2 text-xs transition ${
                          days
                            === value
                            ? "bg-violet-500/15 text-violet-100"
                            : "text-white/35 hover:text-white/70"
                        }`}
                      >
                        {value}
                        d
                      </button>
                    )
                  )}
                </div>
              </div>

              {loading ? (
                <div className="grid min-h-[520px] place-items-center">
                  <LoaderCircle className="size-8 animate-spin text-white/20" />
                </div>
              ) : error ? (
                <div className="surface-card mt-7 border-red-400/15 bg-red-400/[.04] p-5 text-sm text-red-200">
                  {error}
                </div>
              ) : data ? (
                <>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    {stats.map(
                      (stat) => {
                        const Icon =
                          stat.icon;

                        return (
                          <div
                            key={
                              stat.label
                            }
                            className="surface-card p-4"
                          >
                            <Icon className="size-4 text-violet-300" />

                            <div className="mt-4 text-xl font-semibold">
                              {stat.value}
                            </div>

                            <div className="mt-1 text-xs font-medium text-white/55">
                              {stat.label}
                            </div>

                            <div className="mt-1 text-[11px] text-white/25">
                              {stat.detail}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                    <section className="surface-card overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <div className="font-semibold">
                          Plan produkcji
                        </div>

                        <div className="mt-1 text-xs text-white/30">
                          Aktywne zamówienia niezależnie od wybranego zakresu finansowego.
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-5">
                        {[
                          [
                            "Dzisiaj",
                            data.planning.today,
                          ],
                          [
                            "Jutro",
                            data.planning.tomorrow,
                          ],
                          [
                            "Później",
                            data.planning.later,
                          ],
                          [
                            "Po terminie",
                            data.planning.overdue,
                          ],
                        ].map(
                          ([
                            label,
                            value,
                          ]) => (
                            <div
                              key={
                                String(
                                  label
                                )
                              }
                              className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4"
                            >
                              <div className="text-2xl font-semibold">
                                {String(
                                  value
                                )}
                              </div>

                              <div className="mt-1 text-xs text-white/30">
                                {String(
                                  label
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </section>

                    <section className="surface-card overflow-hidden">
                      <div className="border-b border-white/[.06] p-5">
                        <div className="font-semibold">
                          Najbardziej rentowne zamówienia
                        </div>

                        <div className="mt-1 text-xs text-white/30">
                          Według aktualnie zapisanych kosztów materiałów i pracy.
                        </div>
                      </div>

                      {data.top_orders.length
                        === 0 ? (
                        <div className="grid min-h-[220px] place-items-center text-sm text-white/25">
                          Brak danych
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[.055]">
                          {data.top_orders.map(
                            (
                              order
                            ) => (
                              <Link
                                key={
                                  order.id
                                }
                                href={`/orders/${order.id}`}
                                className="grid gap-3 px-5 py-4 transition hover:bg-white/[.02] sm:grid-cols-[1fr_auto_auto]"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white/85">
                                    {order.order_number}
                                    {" · "}
                                    {order.name}
                                  </div>

                                  <div className="mt-1 truncate text-xs text-white/28">
                                    {order.client_name}
                                    {" · "}
                                    {order.status}
                                  </div>
                                </div>

                                <div className="sm:text-right">
                                  <div className={`text-sm font-semibold ${
                                    order.estimated_profit
                                      >= 0
                                      ? "text-emerald-200"
                                      : "text-red-200"
                                  }`}>
                                    {money(
                                      order.estimated_profit
                                    )}
                                  </div>

                                  <div className="mt-1 text-[10px] text-white/25">
                                    zysk
                                  </div>
                                </div>

                                <div className="sm:text-right">
                                  <div className="text-sm font-semibold text-violet-200">
                                    {number(
                                      order.margin_percent
                                    )}
                                    %
                                  </div>

                                  <div className="mt-1 text-[10px] text-white/25">
                                    marża
                                  </div>
                                </div>
                              </Link>
                            )
                          )}
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="surface-card mt-5 overflow-hidden">
                    <div className="border-b border-white/[.06] p-5">
                      <div className="font-semibold">
                        Zamówienia w okresie
                      </div>

                      <div className="mt-1 text-xs text-white/30">
                        Ostatnie {days} dni. Zysk jest szacunkiem przed podatkiem.
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-white/[.055] text-[11px] uppercase tracking-wide text-white/25">
                          <tr>
                            <th className="px-5 py-3 font-medium">
                              Zamówienie
                            </th>
                            <th className="px-5 py-3 font-medium">
                              Wartość
                            </th>
                            <th className="px-5 py-3 font-medium">
                              Materiały
                            </th>
                            <th className="px-5 py-3 font-medium">
                              Praca
                            </th>
                            <th className="px-5 py-3 font-medium">
                              Zysk
                            </th>
                            <th className="px-5 py-3 font-medium">
                              Marża
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-white/[.045]">
                          {data.orders.map(
                            (
                              order
                            ) => (
                              <tr
                                key={
                                  order.id
                                }
                                className="transition hover:bg-white/[.015]"
                              >
                                <td className="px-5 py-4">
                                  <Link
                                    href={`/orders/${order.id}`}
                                    className="font-medium text-white/85 hover:text-violet-200"
                                  >
                                    {order.order_number}
                                  </Link>

                                  <div className="mt-1 max-w-[280px] truncate text-xs text-white/25">
                                    {order.client_name}
                                    {" · "}
                                    {order.name}
                                  </div>
                                </td>

                                <td className="px-5 py-4 text-white/65">
                                  {money(
                                    order.price
                                  )}
                                </td>

                                <td className="px-5 py-4 text-white/55">
                                  {money(
                                    order.material_cost
                                  )}
                                </td>

                                <td className="px-5 py-4 text-white/55">
                                  {money(
                                    order.labor_cost
                                  )}
                                </td>

                                <td className={`px-5 py-4 font-semibold ${
                                  order.estimated_profit
                                    >= 0
                                    ? "text-emerald-200"
                                    : "text-red-200"
                                }`}>
                                  {money(
                                    order.estimated_profit
                                  )}
                                </td>

                                <td className="px-5 py-4 text-violet-200">
                                  {number(
                                    order.margin_percent
                                  )}
                                  %
                                </td>
                              </tr>
                            )
                          )}

                          {data.orders.length
                            === 0 && (
                            <tr>
                              <td
                                colSpan={6}
                                className="px-5 py-12 text-center text-white/25"
                              >
                                Brak zamówień w tym okresie.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="mt-4 text-xs text-white/25">
                    {data.note}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
