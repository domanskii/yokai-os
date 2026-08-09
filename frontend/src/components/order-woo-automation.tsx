"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  UserRound,
} from "lucide-react";

type WooItem = {
  id?: number;
  name: string;
  product_id?: number;
  variation_id?: number;
  quantity: number;
  total: string;
  sku: string;
  meta: { key: string; value: string }[];
};

type WooSummary = {
  woo_order_id: number;
  woo_order_number: string;
  status: string;
  currency: string;
  total: string;
  date_paid: string | null;
  payment_method_title: string;
  customer_note: string;
  customer_name: string;
  nip: string | null;
  billing: {
    company: string;
    email: string;
    phone: string;
    address: string;
  };
  shipping: { address: string };
  shipping_method: string;
  items: WooItem[];
  warnings: string[];
};

type WooData = {
  is_woo: boolean;
  local_order: {
    woo_order_id: number | null;
    woo_order_number: string | null;
    woo_status: string | null;
    woo_last_synced_at: string | null;
    woo_sync_error: string | null;
  };
  automation: {
    woo_order_id: number;
    woo_order_number: string | null;
    woo_status: string | null;
    sync_status: string;
    sync_error: string | null;
    last_sync_at: string | null;
    payload: WooSummary | null;
    warnings: string[];
  } | null;
  logs: {
    id: number;
    status: string;
    message: string | null;
    changes: Record<string, unknown> | null;
    created_at: string;
  }[];
};

async function readError(response: Response, fallback: string) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await response.json();
    if (typeof data.detail === "string") return data.detail;
  } else {
    await response.text();
  }
  return fallback;
}

function dateLabel(value?: string | null) {
  if (!value) return "nigdy";
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function OrderWooAutomation({ orderId }: { orderId: number }) {
  const [data, setData] = useState<WooData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const token = localStorage.getItem("yokai_token");
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/orders/${orderId}/woo-automation`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się pobrać automatyzacji WooCommerce"
          )
        );
      }

      setData(await response.json());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać danych"
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    const token = localStorage.getItem("yokai_token");
    if (!token) return;

    setSyncing(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/orders/${orderId}/woo-automation/sync`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się zsynchronizować WooCommerce"
          )
        );
      }

      setMessage("WooCommerce zsynchronizowany");
      await load();
      window.setTimeout(() => setMessage(""), 2500);
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Nie udało się zsynchronizować"
      );
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <section className="surface-card mt-5 grid min-h-[150px] place-items-center">
        <LoaderCircle className="size-5 animate-spin text-white/25" />
      </section>
    );
  }

  if (!data || !data.is_woo) return null;

  const payload = data.automation?.payload || null;
  const warnings =
    data.automation?.warnings || payload?.warnings || [];
  const hasWooId = Boolean(
    data.local_order.woo_order_id || data.automation?.woo_order_id
  );

  return (
    <section className="surface-card mt-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <ShoppingBag className="size-5 text-cyan-300" />
            Automatyzacja WooCommerce
          </div>
          <div className="mt-1 text-xs text-white/35">
            Klient, płatność, warianty i zmiany ze sklepu synchronizują się z YOKAI OS.
          </div>
        </div>

        <button
          onClick={() => void sync()}
          disabled={syncing || !hasWooId}
          className="secondary-button self-start border-cyan-400/20 text-cyan-100 disabled:opacity-40 sm:self-auto"
        >
          {syncing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Synchronizuj teraz
        </button>
      </div>

      {!hasWooId && (
        <div className="border-b border-amber-400/15 bg-amber-400/[.05] px-5 py-4 text-sm text-amber-100">
          <AlertTriangle className="mr-2 inline size-4" />
          Zamówienie pochodzi z WooCommerce, ale stary import nie zapisał jego ID Woo. Nowe importy będą już łatwiejsze do powiązania.
        </div>
      )}

      <div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
          <Package className="size-4 text-violet-300" />
          <div className="mt-3 text-sm font-semibold">
            Woo #{data.automation?.woo_order_number
              || data.local_order.woo_order_number
              || data.automation?.woo_order_id
              || data.local_order.woo_order_id
              || "—"}
          </div>
          <div className="mt-1 text-xs text-white/30">zamówienie sklepu</div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
          <CheckCircle2 className="size-4 text-emerald-300" />
          <div className="mt-3 text-sm font-semibold">
            {data.automation?.woo_status || data.local_order.woo_status || "brak danych"}
          </div>
          <div className="mt-1 text-xs text-white/30">status WooCommerce</div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
          <CreditCard className="size-4 text-cyan-300" />
          <div className="mt-3 text-sm font-semibold">
            {payload?.payment_method_title || "—"}
          </div>
          <div className="mt-1 text-xs text-white/30">płatność</div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
          <Clock3 className="size-4 text-amber-300" />
          <div className="mt-3 text-sm font-semibold">
            {dateLabel(
              data.automation?.last_sync_at
              || data.local_order.woo_last_synced_at
            )}
          </div>
          <div className="mt-1 text-xs text-white/30">ostatnia synchronizacja</div>
        </div>
      </div>

      {payload && (
        <div className="grid gap-5 border-b border-white/[.06] p-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
            <div className="flex items-center gap-2 font-semibold">
              {payload.billing.company ? (
                <Building2 className="size-4 text-cyan-300" />
              ) : (
                <UserRound className="size-4 text-violet-300" />
              )}
              Klient ze sklepu
            </div>

            <div className="mt-4 text-sm font-semibold text-white/85">
              {payload.customer_name}
            </div>

            <div className="mt-1 text-xs text-white/35">
              {payload.billing.email || "brak e-mail"}
              {payload.billing.phone ? ` · ${payload.billing.phone}` : ""}
            </div>

            {payload.nip && (
              <div className="mt-1 text-xs text-white/35">NIP {payload.nip}</div>
            )}

            {(payload.shipping.address || payload.billing.address) && (
              <div className="mt-4 flex gap-2 text-xs text-white/35">
                <MapPin className="mt-0.5 size-4 shrink-0 text-white/20" />
                <div>
                  {payload.shipping.address || payload.billing.address}
                  {payload.shipping_method && (
                    <div className="mt-1 text-white/25">
                      {payload.shipping_method}
                    </div>
                  )}
                </div>
              </div>
            )}

            {payload.customer_note && (
              <div className="mt-4 rounded-2xl border border-white/[.06] bg-white/[.02] p-3 text-xs text-white/45">
                <strong className="text-white/65">Uwagi klienta:</strong>{" "}
                {payload.customer_note}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Package className="size-4 text-violet-300" />
              Produkty i warianty
            </div>

            <div className="mt-4 space-y-3">
              {payload.items.map((item, index) => (
                <div
                  key={item.id || `${item.product_id}-${index}`}
                  className="rounded-2xl border border-white/[.055] bg-white/[.018] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white/80">
                        {item.quantity} × {item.name}
                      </div>
                      <div className="mt-1 text-[10px] text-white/25">
                        produkt {item.product_id || "—"}
                        {item.variation_id ? ` · wariant ${item.variation_id}` : ""}
                        {item.sku ? ` · SKU ${item.sku}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white/65">
                      {item.total} {payload.currency}
                    </div>
                  </div>

                  {item.meta.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.meta.map((meta, metaIndex) => (
                        <span
                          key={`${meta.key}-${metaIndex}`}
                          className="rounded-full border border-violet-400/12 bg-violet-400/[.04] px-2 py-1 text-[10px] text-violet-100/70"
                        >
                          {meta.key}: {meta.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="border-b border-amber-400/15 bg-amber-400/[.035] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <AlertTriangle className="size-4" />
            Wymaga sprawdzenia
          </div>
          <div className="mt-2 space-y-1">
            {warnings.map((warning, index) => (
              <div
                key={`${warning}-${index}`}
                className="text-xs text-amber-100/60"
              >
                • {warning}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.logs.length > 0 && (
        <div className="p-5">
          <div className="font-semibold">Historia synchronizacji</div>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto">
            {data.logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-4 rounded-2xl border border-white/[.05] bg-white/[.015] px-3 py-2.5"
              >
                <div>
                  <div
                    className={`text-xs font-medium ${
                      log.status === "ok"
                        ? "text-emerald-200"
                        : "text-red-200"
                    }`}
                  >
                    {log.message || log.status}
                  </div>
                  {log.changes && Object.keys(log.changes).length > 0 && (
                    <div className="mt-1 text-[10px] text-white/25">
                      Zmiany: {Object.keys(log.changes).join(", ")}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-[10px] text-white/20">
                  {dateLabel(log.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </section>
  );
}
