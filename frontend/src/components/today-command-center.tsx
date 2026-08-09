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
  Banknote,
  Boxes,
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileWarning,
  LoaderCircle,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Sparkles,
  UserRoundX,
  Wallet,
  Zap,
} from "lucide-react";

type Stats = {
  today: number;
  urgent: number;
  overdue: number;
  ready: number;
  unpaid: number;
  missing_svg: number;
  missing_client: number;
  low_stock: number;
  attention_count: number;
  today_revenue: number;
  today_profit: number;
};

type FocusOrder = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  status: string;
  payment_status: string;
  price: number;
  paid_amount: number;
  deadline: string | null;
  priority: string;
  production_bucket: string;
  fulfillment_method: string;
  fulfillment_status: string;
  is_overdue: boolean;
  is_unpaid: boolean;
  missing_svg: boolean;
  missing_client: boolean;
  estimated_profit: number;
  margin_percent: number;
};

type Attention = {
  key: string;
  type: string;
  severity:
    | "danger"
    | "warning"
    | "info";
  order_id?: number;
  material_id?: number;
  title: string;
  detail: string;
};

type TodayData = {
  generated_at: string;
  stats: Stats;
  focus_orders: FocusOrder[];
  attention: Attention[];
};

async function readError(
  response: Response,
  fallback: string
) {
  const type =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    type.includes(
      "application/json"
    )
  ) {
    const data =
      await response.json();

    if (
      typeof data.detail
      === "string"
    ) {
      return data.detail;
    }
  } else {
    await response.text();
  }

  return fallback;
}

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

function dateLabel(
  value: string | null
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

function attentionIcon(
  type: string
) {
  if (
    type === "low_stock"
  ) {
    return Boxes;
  }

  if (
    type === "missing_svg"
  ) {
    return FileWarning;
  }

  if (
    type === "missing_client"
  ) {
    return UserRoundX;
  }

  if (
    type === "ready_unpaid"
  ) {
    return Banknote;
  }

  return AlertTriangle;
}

export function TodayCommandCenter() {
  const [
    data,
    setData,
  ] = useState<
    TodayData | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busyId,
    setBusyId,
  ] = useState<
    number | null
  >(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

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
          throw new Error(
            await readError(
              response,
              "Nie udało się pobrać centrum dnia"
            )
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
            : "Nie udało się pobrać centrum dnia"
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

  const quickAction =
    async (
      orderId: number,
      action: string
    ) => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        return;
      }

      setBusyId(
        orderId
      );

      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/quick-action`,
            {
              method:
                "POST",
              headers: {
                Authorization:
                  `Bearer ${token}`,
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  {
                    action,
                  }
                ),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się wykonać akcji"
            )
          );
        }

        const result =
          await response.json();

        setMessage(
          result.message
          || "Gotowe"
        );

        await load();

        window.setTimeout(
          () =>
            setMessage(
              ""
            ),
          2200
        );
      } catch (
        actionError
      ) {
        setError(
          actionError
            instanceof Error
            ? actionError.message
            : "Nie udało się wykonać akcji"
        );
      } finally {
        setBusyId(
          null
        );
      }
    };

  const cards =
    useMemo(() => {
      if (!data) {
        return [];
      }

      return [
        {
          label:
            "Na dziś",
          value:
            data.stats.today,
          icon:
            CalendarCheck2,
          detail:
            `${money(data.stats.today_revenue)} obrotu`,
        },
        {
          label:
            "Pilne",
          value:
            data.stats.urgent,
          icon:
            Rocket,
          detail:
            "najwyższy priorytet",
        },
        {
          label:
            "Po terminie",
          value:
            data.stats.overdue,
          icon:
            ShieldAlert,
          detail:
            "wymaga reakcji",
        },
        {
          label:
            "Gotowe do wydania",
          value:
            data.stats.ready,
          icon:
            CheckCircle2,
          detail:
            "wysyłka / odbiór",
        },
        {
          label:
            "Nieopłacone",
          value:
            data.stats.unpaid,
          icon:
            CircleDollarSign,
          detail:
            "aktywne zamówienia",
        },
        {
          label:
            "Niski stan",
          value:
            data.stats.low_stock,
          icon:
            Boxes,
          detail:
            "materiały poniżej progu",
        },
      ];
    }, [data]);

  if (loading) {
    return (
      <section className="mx-auto mt-5 grid min-h-[260px] max-w-[1540px] place-items-center px-4 sm:px-6 lg:px-8">
        <LoaderCircle className="size-7 animate-spin text-white/20" />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mx-auto mt-5 max-w-[1540px] px-4 sm:px-6 lg:px-8">
        <div className="surface-card border-red-400/15 bg-red-400/[.04] p-5 text-sm text-red-200">
          {error
            || "Brak danych centrum dnia"}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-5 max-w-[1540px] px-4 pb-6 sm:px-6 lg:px-8">
      <div className="surface-card overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <Zap className="size-4" />
              Centrum dnia
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              Co wymaga Twojej uwagi
            </h2>

            <div className="mt-1 text-xs text-white/32">
              Kolejka jest sortowana według opóźnienia, priorytetu i terminu.
            </div>
          </div>

          <button
            onClick={() =>
              void load()
            }
            className="secondary-button self-start sm:self-auto"
          >
            <RefreshCw className="size-4" />
            Odśwież
          </button>
        </div>

        <div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-2 xl:grid-cols-6">
          {cards.map(
            (card) => {
              const Icon =
                card.icon;

              return (
                <div
                  key={
                    card.label
                  }
                  className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4"
                >
                  <Icon className="size-4 text-violet-300" />

                  <div className="mt-3 text-2xl font-semibold">
                    {card.value}
                  </div>

                  <div className="mt-1 text-xs font-medium text-white/55">
                    {card.label}
                  </div>

                  <div className="mt-1 text-[10px] text-white/25">
                    {card.detail}
                  </div>
                </div>
              );
            }
          )}
        </div>

        <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
          <div className="border-b border-white/[.06] xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-white/[.055] px-5 py-4">
              <div>
                <div className="font-semibold">
                  Kolejka priorytetowa
                </div>

                <div className="mt-1 text-xs text-white/28">
                  Na dziś + pilne + po terminie
                </div>
              </div>

              <div className="rounded-full border border-violet-400/15 bg-violet-400/[.05] px-3 py-1.5 text-xs text-violet-200">
                Potencjalny zysk dziś:{" "}
                {money(
                  data.stats.today_profit
                )}
              </div>
            </div>

            {data.focus_orders.length
              === 0 ? (
              <div className="grid min-h-[260px] place-items-center text-center">
                <div>
                  <Sparkles className="mx-auto size-9 text-white/15" />

                  <div className="mt-3 text-sm font-medium">
                    Brak pilnych zadań
                  </div>

                  <div className="mt-1 text-xs text-white/25">
                    Możesz spokojnie realizować kolejkę Produkcji.
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[.05]">
                {data.focus_orders.map(
                  (order) => (
                    <div
                      key={
                        order.id
                      }
                      className="p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <Link
                          href={`/orders/${order.id}`}
                          className="min-w-0 flex-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white/88">
                              {order.order_number}
                              {" · "}
                              {order.name}
                            </span>

                            {order.is_overdue && (
                              <span className="rounded-full border border-red-400/20 bg-red-400/[.06] px-2 py-0.5 text-[10px] text-red-200">
                                po terminie
                              </span>
                            )}

                            {order.priority
                              === "urgent" && (
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/[.06] px-2 py-0.5 text-[10px] text-amber-200">
                                pilne
                              </span>
                            )}

                            {order.missing_svg && (
                              <span className="rounded-full border border-white/[.08] px-2 py-0.5 text-[10px] text-white/35">
                                brak SVG
                              </span>
                            )}
                          </div>

                          <div className="mt-1 text-xs text-white/28">
                            {order.client_name
                              || "Bez klienta"}
                            {" · "}
                            {order.status}
                            {" · "}
                            {dateLabel(
                              order.deadline
                            )}
                            {" · "}
                            {money(
                              order.price
                            )}
                          </div>
                        </Link>

                        <div className="flex flex-wrap gap-2">
                          {order.production_bucket
                            !== "today" && (
                            <button
                              onClick={() =>
                                void quickAction(
                                  order.id,
                                  "move_today"
                                )
                              }
                              disabled={
                                busyId
                                === order.id
                              }
                              className="secondary-button compact disabled:opacity-40"
                            >
                              Dziś
                            </button>
                          )}

                          <button
                            onClick={() =>
                              void quickAction(
                                order.id,
                                "next_status"
                              )
                            }
                            disabled={
                              busyId
                              === order.id
                              || order.status
                              === "Zrealizowane"
                            }
                            className="secondary-button compact disabled:opacity-40"
                          >
                            Status +
                          </button>

                          {order.is_unpaid && (
                            <button
                              onClick={() =>
                                void quickAction(
                                  order.id,
                                  "mark_paid"
                                )
                              }
                              disabled={
                                busyId
                                === order.id
                              }
                              className="secondary-button compact border-emerald-400/20 text-emerald-200 disabled:opacity-40"
                            >
                              Opłacone
                            </button>
                          )}

                          {order.status
                            !== "Gotowe" && (
                            <button
                              onClick={() =>
                                void quickAction(
                                  order.id,
                                  "mark_ready"
                                )
                              }
                              disabled={
                                busyId
                                === order.id
                              }
                              className="secondary-button compact border-violet-400/20 text-violet-200 disabled:opacity-40"
                            >
                              Gotowe
                            </button>
                          )}

                          <button
                            onClick={() =>
                              void quickAction(
                                order.id,
                                "move_tomorrow"
                              )
                            }
                            disabled={
                              busyId
                              === order.id
                            }
                            className="secondary-button compact disabled:opacity-40"
                          >
                            Jutro
                          </button>

                          <Link
                            href={`/orders/${order.id}`}
                            className="secondary-button compact"
                          >
                            Otwórz
                            <ChevronRight className="size-4" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-white/[.055] px-5 py-4">
              <div>
                <div className="font-semibold">
                  Alerty
                </div>

                <div className="mt-1 text-xs text-white/28">
                  {data.stats.attention_count}
                  {" elementów wymaga uwagi"}
                </div>
              </div>

              {data.stats.attention_count
                > 0 && (
                <AlertTriangle className="size-5 text-amber-300" />
              )}
            </div>

            {data.attention.length
              === 0 ? (
              <div className="grid min-h-[260px] place-items-center text-center">
                <div>
                  <CheckCircle2 className="mx-auto size-9 text-emerald-300/40" />

                  <div className="mt-3 text-sm font-medium">
                    Wszystko pod kontrolą
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[520px] divide-y divide-white/[.05] overflow-y-auto">
                {data.attention.map(
                  (item) => {
                    const Icon =
                      attentionIcon(
                        item.type
                      );

                    const href =
                      item.order_id
                        ? `/orders/${item.order_id}`
                        : "/materials";

                    return (
                      <Link
                        key={
                          item.key
                        }
                        href={
                          href
                        }
                        className="flex items-start gap-3 px-5 py-4 transition hover:bg-white/[.02]"
                      >
                        <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border ${
                          item.severity
                            === "danger"
                            ? "border-red-400/15 bg-red-400/[.05] text-red-200"
                            : item.severity
                                === "warning"
                              ? "border-amber-400/15 bg-amber-400/[.05] text-amber-200"
                              : "border-cyan-400/15 bg-cyan-400/[.05] text-cyan-200"
                        }`}>
                          <Icon className="size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-white/78">
                            {item.title}
                          </div>

                          <div className="mt-1 text-xs text-white/28">
                            {item.detail}
                          </div>
                        </div>

                        <ChevronRight className="mt-2 size-4 shrink-0 text-white/15" />
                      </Link>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="border-t border-red-400/15 bg-red-400/[.05] px-5 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="border-t border-emerald-400/15 bg-emerald-400/[.05] px-5 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}
      </div>
    </section>
  );
}
