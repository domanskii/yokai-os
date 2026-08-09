"use client";

import { OrderAiProjects } from "../../../components/order-ai-projects";

import { OrderWooAutomation } from "../../../components/order-woo-automation";

import { OrderWorkflow } from "../../../components/order-workflow";

import { OrderOperationsFinance } from "../../../components/order-operations-finance";

import { OrderInstructionPdfs } from "../../../components/order-instruction-pdfs";

import { OrderClientSelector } from "../../../components/order-client-selector";

import { OrderSvgAssets } from "../../../components/order-svg-assets";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  LoaderCircle,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShoppingBag,
  Truck,
  UserRound,
  Zap,
} from "lucide-react";

type Order = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  source: string;
  size: string | null;
  quantity: number;
  price: string | number;
  paid_amount: string | number;
  payment_status: string;
  deadline: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Address = {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  postcode: string;
  city: string;
  state: string;
  country: string;
  email: string;
  phone: string;
};

type WooMeta = {
  id?: number;
  key: string;
  display_key: string;
  value: unknown;
  display_value: unknown;
};

type WooItem = {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku: string;
  price: string;
  subtotal: string;
  total: string;
  tax: string;
  image_url: string | null;
  image_alt: string;
  meta: WooMeta[];
};

type WooDetails = {
  internal_order_id: number;
  internal_order_number: string;
  woocommerce_order_id: number;
  woocommerce_order_number: string;
  woocommerce_status: string;
  currency: string;
  total: string;
  subtotal: string;
  discount_total: string;
  shipping_total: string;
  total_tax: string;
  date_created: string | null;
  date_modified: string | null;
  date_paid: string | null;
  date_completed: string | null;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_note: string;
  billing: Address;
  shipping: Address;
  items: WooItem[];
  shipping_methods: Array<{
    id: number;
    method_title: string;
    method_id: string;
    total: string;
    meta: WooMeta[];
  }>;
  fees: Array<{
    id: number;
    name: string;
    total: string;
  }>;
  coupons: Array<{
    code: string;
    discount: string;
  }>;
  order_meta: WooMeta[];
};

function formatMoney(
  value: string | number,
  currency = "PLN"
) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "Brak";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function cleanValue(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (
    typeof value === "object"
  ) {
    return JSON.stringify(value);
  }

  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ProductThumbnail({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] =
    useState(false);

  return (
    <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025]">
      {src && !failed ? (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="block size-full"
          title="Otwórz zdjęcie"
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className="size-full object-cover transition duration-300 hover:scale-105"
          />
        </a>
      ) : (
        <Package className="size-8 text-white/15" />
      )}
    </div>
  );
}


function AddressCard({
  title,
  address,
}: {
  title: string;
  address: Address;
}) {
  const name = [
    address.first_name,
    address.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [
    address.company,
    name,
    address.address_1,
    address.address_2,
    [
      address.postcode,
      address.city,
    ]
      .filter(Boolean)
      .join(" "),
    address.country,
  ].filter(Boolean);

  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MapPin className="size-4 text-violet-300" />
        {title}
      </div>

      <div className="mt-4 space-y-1 text-sm leading-6 text-white/60">
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <div key={`${line}-${index}`}>
              {line}
            </div>
          ))
        ) : (
          <div className="text-white/30">
            Brak danych adresowych
          </div>
        )}
      </div>
    </section>
  );
}

export default function OrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const orderId = Number(params.id);

  const [order, setOrder] =
    useState<Order | null>(null);

  const [details, setDetails] =
    useState<WooDetails | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const load = async () => {
    const token =
      localStorage.getItem("yokai_token");

    if (!token) {
      router.replace("/");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const orderResponse = await fetch(
        `/api/orders/${orderId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (orderResponse.status === 401) {
        localStorage.removeItem("yokai_token");
        localStorage.removeItem("yokai_email");
        router.replace("/");
        return;
      }

      const orderData =
        await orderResponse.json();

      if (!orderResponse.ok) {
        throw new Error(
          orderData.detail ||
            "Nie udało się pobrać zamówienia"
        );
      }

      setOrder(orderData);

      if (
        orderData.source === "WooCommerce"
      ) {
        const detailsResponse = await fetch(
          `/api/orders/${orderId}/woocommerce-details`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const detailsData =
          await detailsResponse.json();

        if (!detailsResponse.ok) {
          throw new Error(
            detailsData.detail ||
              "Nie udało się pobrać danych WooCommerce"
          );
        }

        setDetails(detailsData);
      } else {
        setDetails(null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Wystąpił błąd"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      Number.isInteger(orderId) &&
      orderId > 0
    ) {
      void load();
    } else {
      setError(
        "Nieprawidłowy numer zamówienia"
      );
      setLoading(false);
    }
  }, [orderId]);

  const customerEmail =
    details?.billing.email || "";

  const customerPhone =
    details?.billing.phone || "";

  const visibleOrderMeta = useMemo(
    () =>
      details?.order_meta.filter(
        (item) =>
          cleanValue(item.display_value) !== "—"
      ) || [],
    [details]
  );

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090b10] text-white">
        <div className="flex items-center gap-3 text-sm text-white/45">
          <LoaderCircle className="size-5 animate-spin" />
          Pobieranie zamówienia...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%)]" />

      <header className="sticky top-0 z-30 border-b border-white/[.06] bg-[#090b10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-6 xl:px-8">
          <button
            onClick={() => router.push("/orders")}
            className="secondary-button compact"
          >
            <ArrowLeft className="size-4" />
            Zamówienia
          </button>

          <div className="flex gap-2">
            <button
              onClick={() =>
                router.push("/production")
              }
              className="secondary-button compact"
            >
              <Zap className="size-4" />
              Produkcja
            </button>

            <button
              onClick={() => void load()}
              className="icon-button"
              title="Odśwież dane"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-7 sm:px-6 xl:px-8 xl:py-10">
        {error ? (
          <section className="surface-card mx-auto max-w-2xl p-7 text-center">
            <div className="text-lg font-semibold text-red-200">
              Nie udało się otworzyć zamówienia
            </div>
            <div className="mt-3 text-sm text-white/45">
              {error}
            </div>
          </section>
        ) : order ? (
          <>
            <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
                  {order.order_number}
                  {details && (
                    <>
                      {" "}
                      · WooCommerce #
                      {details.woocommerce_order_number}
                    </>
                  )}
                </div>

                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {order.name}
                </h1>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-violet-400/20 bg-violet-400/[.07] px-3 py-1 text-xs text-violet-200">
                    {order.status}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs text-white/55">
                    {order.source}
                  </span>

                  <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs text-white/55">
                    {order.payment_status}
                  </span>
                </div>
              </div>

              <button
                onClick={() =>
                  router.push("/orders")
                }
                className="primary-button self-start lg:self-auto"
              >
                <ShoppingBag className="size-4" />
                Edytuj zamówienie
              </button>
            </section>

            <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="surface-card p-5">
                <CircleDollarSign className="size-4 text-emerald-300" />
                <div className="mt-5 text-2xl font-semibold">
                  {formatMoney(
                    details?.total || order.price,
                    details?.currency || "PLN"
                  )}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Wartość
                </div>
              </div>

              <div className="surface-card p-5">
                <CreditCard className="size-4 text-violet-300" />
                <div className="mt-5 text-2xl font-semibold">
                  {formatMoney(
                    order.paid_amount
                  )}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Wpłacono
                </div>
              </div>

              <div className="surface-card p-5">
                <Package className="size-4 text-cyan-300" />
                <div className="mt-5 text-2xl font-semibold">
                  {order.quantity}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Liczba sztuk
                </div>
              </div>

              <div className="surface-card p-5">
                <CalendarDays className="size-4 text-amber-300" />
                <div className="mt-5 text-sm font-semibold">
                  {details
                    ? formatDate(
                        details.date_created
                      )
                    : formatDate(
                        order.created_at
                      )}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  Data zamówienia
                </div>
              </div>
            </section>

            <OrderClientSelector
              orderId={order.id}
              currentClientName={order.client_name}
            />

            <OrderOperationsFinance
              orderId={order.id}
            />

            <OrderWorkflow
              orderId={order.id}
            />

            <OrderWooAutomation
              orderId={order.id}
            />

            <OrderAiProjects
              orderId={order.id}
            />

            <OrderSvgAssets
              orderId={order.id}
              clientName={order.client_name}
            />

            <OrderInstructionPdfs
              orderId={order.id}
              orderNumber={order.order_number}
              clientName={order.client_name}
              orderName={order.name}
            />



            {details ? (
              <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_.85fr]">
                <div className="space-y-5">
                  <section className="surface-card overflow-hidden">
                    <div className="border-b border-white/[.06] p-5">
                      <div className="flex items-center gap-2 font-semibold">
                        <Package className="size-5 text-violet-300" />
                        Produkty
                      </div>
                    </div>

                    <div className="divide-y divide-white/[.055]">
                      {details.items.map(
                        (item) => (
                          <article
                            key={item.id}
                            className="p-5"
                          >
                            <div className="flex items-start gap-4">
                              <ProductThumbnail
                                src={item.image_url}
                                alt={
                                  item.image_alt ||
                                  item.name
                                }
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-white/90">
                                      {item.name}
                                    </div>

                                    <div className="mt-1 text-xs text-white/35">
                                      {item.quantity} szt.
                                      {item.sku
                                        ? ` · SKU: ${item.sku}`
                                        : ""}
                                      {item.variation_id
                                        ? ` · wariant ${item.variation_id}`
                                        : ""}
                                    </div>
                                  </div>

                                  <div className="shrink-0 text-sm font-semibold">
                                    {formatMoney(
                                      item.total,
                                      details.currency
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {item.meta.length > 0 && (
                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                {item.meta.map(
                                  (
                                    meta,
                                    index
                                  ) => (
                                    <div
                                      key={`${meta.key}-${index}`}
                                      className="rounded-xl border border-white/[.055] bg-white/[.025] px-3 py-2"
                                    >
                                      <div className="text-[10px] uppercase tracking-wide text-white/30">
                                        {meta.display_key}
                                      </div>
                                      <div className="mt-1 break-words text-sm text-white/70">
                                        {cleanValue(
                                          meta.display_value
                                        )}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </article>
                        )
                      )}
                    </div>
                  </section>

                  {details.customer_note && (
                    <section className="surface-card p-5">
                      <div className="text-sm font-semibold">
                        Uwagi klienta
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/60">
                        {details.customer_note}
                      </div>
                    </section>
                  )}

                  {order.notes && (
                    <section className="surface-card p-5">
                      <div className="text-sm font-semibold">
                        Notatki YOKAI OS
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/60">
                        {order.notes}
                      </div>
                    </section>
                  )}

                  {visibleOrderMeta.length > 0 && (
                    <section className="surface-card p-5">
                      <div className="text-sm font-semibold">
                        Dodatkowe dane zamówienia
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {visibleOrderMeta.map(
                          (meta, index) => (
                            <div
                              key={`${meta.key}-${index}`}
                              className="rounded-xl border border-white/[.055] bg-white/[.025] px-3 py-2"
                            >
                              <div className="text-[10px] uppercase tracking-wide text-white/30">
                                {meta.display_key}
                              </div>
                              <div className="mt-1 break-words text-sm text-white/65">
                                {cleanValue(
                                  meta.display_value
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-5">
                  <section className="surface-card p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <UserRound className="size-4 text-violet-300" />
                      Klient
                    </div>

                    <div className="mt-4 text-lg font-semibold">
                      {order.client_name}
                    </div>

                    <div className="mt-4 space-y-3">
                      {customerEmail && (
                        <a
                          href={`mailto:${customerEmail}`}
                          className="flex items-center gap-3 text-sm text-white/60 hover:text-white"
                        >
                          <Mail className="size-4 text-white/30" />
                          {customerEmail}
                        </a>
                      )}

                      {customerPhone && (
                        <a
                          href={`tel:${customerPhone}`}
                          className="flex items-center gap-3 text-sm text-white/60 hover:text-white"
                        >
                          <Phone className="size-4 text-white/30" />
                          {customerPhone}
                        </a>
                      )}
                    </div>
                  </section>

                  <AddressCard
                    title="Adres rozliczeniowy"
                    address={details.billing}
                  />

                  <AddressCard
                    title="Adres dostawy"
                    address={details.shipping}
                  />

                  <section className="surface-card p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CreditCard className="size-4 text-emerald-300" />
                      Płatność
                    </div>

                    <div className="mt-4 text-sm text-white/65">
                      {details.payment_method_title ||
                        "Nie podano"}
                    </div>

                    <div className="mt-2 text-xs text-white/35">
                      Opłacono:{" "}
                      {formatDate(
                        details.date_paid
                      )}
                    </div>

                    {details.transaction_id && (
                      <div className="mt-2 break-all text-xs text-white/30">
                        ID: {details.transaction_id}
                      </div>
                    )}
                  </section>

                  <section className="surface-card p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Truck className="size-4 text-cyan-300" />
                      Dostawa
                    </div>

                    {details.shipping_methods.length >
                    0 ? (
                      <div className="mt-4 space-y-3">
                        {details.shipping_methods.map(
                          (shipping) => (
                            <div
                              key={shipping.id}
                              className="rounded-xl border border-white/[.055] bg-white/[.025] p-3"
                            >
                              <div className="text-sm text-white/65">
                                {shipping.method_title}
                              </div>
                              <div className="mt-1 text-xs text-white/35">
                                {formatMoney(
                                  shipping.total,
                                  details.currency
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 text-sm text-white/35">
                        Brak metody dostawy
                      </div>
                    )}
                  </section>

                  <section className="surface-card p-5">
                    <div className="text-sm font-semibold">
                      Podsumowanie
                    </div>

                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between text-white/45">
                        <span>Dostawa</span>
                        <span>
                          {formatMoney(
                            details.shipping_total,
                            details.currency
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between text-white/45">
                        <span>Rabat</span>
                        <span>
                          {formatMoney(
                            details.discount_total,
                            details.currency
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between border-t border-white/[.06] pt-3 font-semibold">
                        <span>Razem</span>
                        <span>
                          {formatMoney(
                            details.total,
                            details.currency
                          )}
                        </span>
                      </div>
                    </div>
                  </section>
                </aside>
              </div>
            ) : (
              <section className="surface-card mt-5 p-6">
                <div className="text-lg font-semibold">
                  Zamówienie ręczne
                </div>

                <div className="mt-3 text-sm leading-6 text-white/50">
                  To zamówienie nie pochodzi z WooCommerce.
                  Pełna edycja jest dostępna w module Zamówienia.
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
