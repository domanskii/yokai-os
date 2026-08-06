"use client";

import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileImage,
  Gauge,
  GripVertical,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  WandSparkles,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

type OrderStatus =
  | "Nowe"
  | "Projekt"
  | "Produkcja"
  | "Gotowe"
  | "Zrealizowane"
  | "Anulowane";

type PaymentStatus =
  | "Nieopłacone"
  | "Zaliczka"
  | "Opłacone"
  | "Zwrot";

type ApiOrder = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  source: string;
  size: string | null;
  quantity: number;
  price: string | number;
  paid_amount: string | number;
  payment_status: PaymentStatus;
  deadline: string | null;
  notes: string | null;
  status: OrderStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type ProductionColumn = {
  status: OrderStatus;
  label: string;
  hint: string;
  accent: string;
  dot: string;
};

type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  active?: boolean;
};

const columns: ProductionColumn[] = [
  {
    status: "Nowe",
    label: "Nowe",
    hint: "Do sprawdzenia",
    accent: "border-sky-400/20",
    dot: "bg-sky-400",
  },
  {
    status: "Projekt",
    label: "Projekt",
    hint: "Projekt i akceptacja",
    accent: "border-violet-400/20",
    dot: "bg-violet-400",
  },
  {
    status: "Produkcja",
    label: "Produkcja",
    hint: "Realizacja na warsztacie",
    accent: "border-cyan-400/20",
    dot: "bg-cyan-400",
  },
  {
    status: "Gotowe",
    label: "Gotowe",
    hint: "Pakowanie, odbiór lub wysyłka",
    accent: "border-amber-400/20",
    dot: "bg-amber-400",
  },
  {
    status: "Zrealizowane",
    label: "Zrealizowane",
    hint: "Zamknięte",
    accent: "border-green-400/20",
    dot: "bg-green-400",
  },
];

const nav: NavItem[] = [
  {
    label: "Dashboard",
    icon: Gauge,
    href: "/",
  },
  {
    label: "Produkcja",
    icon: Zap,
    href: "/production",
    active: true,
  },
  {
    label: "Zamówienia",
    icon: ShoppingBag,
    href: "/orders",
  },
  {
    label: "Biblioteka SVG",
    icon: FileImage,
    href: "/",
  },
  {
    label: "Kalkulator",
    icon: CircleDollarSign,
    href: "/",
  },
  {
    label: "Materiały",
    icon: Boxes,
    href: "/",
  },
  {
    label: "Klienci",
    icon: Users,
    href: "/",
  },
  {
    label: "AI Studio",
    icon: WandSparkles,
    href: "/",
  },
  {
    label: "Ustawienia",
    icon: Settings,
    href: "/",
  },
];

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "Bez terminu";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function isOverdue(order: ApiOrder) {
  if (
    !order.deadline ||
    order.status === "Zrealizowane" ||
    order.status === "Anulowane"
  ) {
    return false;
  }

  const deadline = new Date(`${order.deadline}T23:59:59`);
  return deadline.getTime() < Date.now();
}

function LogoMark() {
  return (
    <div className="relative grid size-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,.18)]">
      <span className="text-lg font-black tracking-tighter text-white">
        Y
      </span>
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

function PaymentBadge({
  status,
}: {
  status: PaymentStatus;
}) {
  const style =
    {
      Nieopłacone:
        "border-red-400/20 bg-red-400/[.07] text-red-200",
      Zaliczka:
        "border-amber-400/20 bg-amber-400/[.07] text-amber-200",
      Opłacone:
        "border-emerald-400/20 bg-emerald-400/[.07] text-emerald-200",
      Zwrot:
        "border-slate-400/20 bg-slate-400/[.07] text-slate-200",
    }[status];

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style}`}
    >
      {status}
    </span>
  );
}

function OrderCard({
  order,
  saving,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  order: ApiOrder;
  saving: boolean;
  onOpen: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const overdue = isOverdue(order);

  return (
    <article
      draggable={!saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group cursor-grab rounded-2xl border bg-[#11151c] p-4 shadow-lg transition active:cursor-grabbing ${
        overdue
          ? "border-red-400/30 bg-red-400/[.035]"
          : "border-white/[.065] hover:border-violet-400/25 hover:bg-[#141922]"
      } ${saving ? "pointer-events-none opacity-55" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold tracking-wide text-white/35">
          {order.order_number}
        </div>

        {saving ? (
          <LoaderCircle className="size-4 animate-spin text-violet-300" />
        ) : (
          <GripVertical className="size-4 text-white/15 transition group-hover:text-white/45" />
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-white/90">
        {order.name}
      </h3>

      <div className="mt-2 truncate text-xs text-white/40">
        {order.client_name}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <PaymentBadge status={order.payment_status} />

        {order.source === "WooCommerce" && (
          <span className="rounded-full border border-violet-400/20 bg-violet-400/[.07] px-2 py-0.5 text-[10px] text-violet-200">
            WooCommerce
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-white/[.055] pt-3 text-[11px] text-white/35">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Termin
          </span>

          <span
            className={
              overdue
                ? "font-semibold text-red-300"
                : "text-white/55"
            }
          >
            {formatDate(order.deadline)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span>
            {order.quantity} szt.
            {order.size ? ` · ${order.size}` : ""}
          </span>

          <span className="font-semibold text-white/70">
            {formatMoney(order.price)}
          </span>
        </div>
      </div>

      {overdue && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[.06] px-3 py-2 text-[10px] text-red-200">
          <CircleAlert className="size-3.5" />
          Zamówienie po terminie
        </div>
      )}
    </article>
  );
}

function OrderDrawer({
  order,
  saving,
  onClose,
  onMove,
  onOpenOrders,
}: {
  order: ApiOrder;
  saving: boolean;
  onClose: () => void;
  onMove: (status: OrderStatus) => void;
  onOpenOrders: () => void;
}) {
  const currentIndex = columns.findIndex(
    (column) => column.status === order.status
  );

  const previous =
    currentIndex > 0
      ? columns[currentIndex - 1]
      : null;

  const next =
    currentIndex >= 0 && currentIndex < columns.length - 1
      ? columns[currentIndex + 1]
      : null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <aside className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              {order.order_number}
            </div>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {order.name}
            </h2>

            <p className="mt-2 text-sm text-white/40">
              {order.client_name}
            </p>
          </div>

          <button
            onClick={onClose}
            className="icon-button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">
              Wartość
            </div>
            <div className="mt-2 text-xl font-semibold">
              {formatMoney(order.price)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">
              Wpłacono
            </div>
            <div className="mt-2 text-xl font-semibold">
              {formatMoney(order.paid_amount)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">
              Termin
            </div>
            <div
              className={`mt-2 text-sm font-semibold ${
                isOverdue(order)
                  ? "text-red-300"
                  : "text-white"
              }`}
            >
              {formatDate(order.deadline)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">
              Źródło
            </div>
            <div className="mt-2 text-sm font-semibold">
              {order.source}
            </div>
          </div>
        </div>

        <label className="field mt-6">
          <span>Etap produkcji</span>

          <select
            value={order.status}
            disabled={saving}
            onChange={(event) =>
              onMove(event.target.value as OrderStatus)
            }
          >
            {columns.map((column) => (
              <option
                key={column.status}
                value={column.status}
              >
                {column.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6 rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-white/35">
                Ilość
              </div>
              <div className="mt-1 font-medium">
                {order.quantity} szt.
              </div>
            </div>

            <div>
              <div className="text-xs text-white/35">
                Wymiar
              </div>
              <div className="mt-1 font-medium">
                {order.size || "Nie podano"}
              </div>
            </div>
          </div>

          {order.notes && (
            <div className="mt-5 border-t border-white/[.06] pt-4">
              <div className="text-xs text-white/35">
                Notatki
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">
                {order.notes}
              </div>
            </div>
          )}
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            disabled={!previous || saving}
            onClick={() =>
              previous && onMove(previous.status)
            }
            className="secondary-button justify-center disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="size-4" />
            {previous
              ? previous.label
              : "Pierwszy etap"}
          </button>

          <button
            disabled={!next || saving}
            onClick={() =>
              next && onMove(next.status)
            }
            className="primary-button justify-center disabled:cursor-not-allowed disabled:opacity-35"
          >
            {next
              ? next.label
              : "Zakończone"}
            <ChevronRight className="size-4" />
          </button>
        </div>

        <button
          onClick={onOpenOrders}
          className="secondary-button mt-3 w-full justify-center"
        >
          <ShoppingBag className="size-4" />
          Otwórz pełną edycję zamówienia
        </button>
      </aside>
    </div>
  );
}

export default function ProductionPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [selected, setSelected] =
    useState<ApiOrder | null>(null);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] =
    useState<"all" | "woocommerce" | "manual">("all");

  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [draggedOrderId, setDraggedOrderId] =
    useState<number | null>(null);
  const [dragTarget, setDragTarget] =
    useState<OrderStatus | null>(null);
  const [savingOrderId, setSavingOrderId] =
    useState<number | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(
      () => setToast(""),
      2600
    );
  };

  const logout = () => {
    localStorage.removeItem("yokai_token");
    localStorage.removeItem("yokai_email");
    router.replace("/");
  };

  const authorizedFetch = async (
    url: string,
    init?: RequestInit
  ) => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("Sesja wygasła");
    }

    return response;
  };

  const loadOrders = async () => {
    if (!token) return;

    setLoading(true);

    try {
      const response = await authorizedFetch(
        "/api/orders?archived=false&limit=500"
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Nie udało się pobrać produkcji"
        );
      }

      setOrders(data);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać produkcji"
      );
    } finally {
      setLoading(false);
    }
  };

  const moveOrder = async (
    order: ApiOrder,
    nextStatus: OrderStatus
  ) => {
    if (
      order.status === nextStatus ||
      savingOrderId === order.id
    ) {
      return;
    }

    const previousOrder = order;

    setSavingOrderId(order.id);

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: nextStatus,
            }
          : item
      )
    );

    setSelected((current) =>
      current?.id === order.id
        ? {
            ...current,
            status: nextStatus,
          }
        : current
    );

    try {
      const response = await authorizedFetch(
        `/api/orders/${order.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Nie udało się zmienić statusu"
        );
      }

      setOrders((current) =>
        current.map((item) =>
          item.id === data.id
            ? data
            : item
        )
      );

      setSelected((current) =>
        current?.id === data.id
          ? data
          : current
      );

      showToast(
        `${data.order_number}: ${nextStatus}`
      );
    } catch (error) {
      setOrders((current) =>
        current.map((item) =>
          item.id === previousOrder.id
            ? previousOrder
            : item
        )
      );

      setSelected((current) =>
        current?.id === previousOrder.id
          ? previousOrder
          : current
      );

      showToast(
        error instanceof Error
          ? error.message
          : "Nie udało się zmienić statusu"
      );
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleDrop = (
    event: DragEvent<HTMLElement>,
    status: OrderStatus
  ) => {
    event.preventDefault();

    if (draggedOrderId === null) return;

    const order = orders.find(
      (item) => item.id === draggedOrderId
    );

    setDraggedOrderId(null);
    setDragTarget(null);

    if (order) {
      void moveOrder(order, status);
    }
  };

  useEffect(() => {
    const storedToken =
      localStorage.getItem("yokai_token");

    const storedEmail =
      localStorage.getItem("yokai_email") || "";

    if (!storedToken) {
      router.replace("/");
      return;
    }

    setToken(storedToken);
    setEmail(storedEmail);
  }, [router]);

  useEffect(() => {
    void loadOrders();
  }, [token]);

  const visibleOrders = useMemo(() => {
    const phrase = search
      .trim()
      .toLocaleLowerCase("pl");

    return orders.filter((order) => {
      if (order.status === "Anulowane") {
        return false;
      }

      if (
        sourceFilter === "woocommerce" &&
        order.source !== "WooCommerce"
      ) {
        return false;
      }

      if (
        sourceFilter === "manual" &&
        order.source === "WooCommerce"
      ) {
        return false;
      }

      if (!phrase) return true;

      return [
        order.order_number,
        order.name,
        order.client_name,
        order.source,
      ]
        .join(" ")
        .toLocaleLowerCase("pl")
        .includes(phrase);
    });
  }, [orders, search, sourceFilter]);

  const overdueCount = visibleOrders.filter(
    isOverdue
  ).length;

  const unpaidCount = visibleOrders.filter(
    (order) =>
      order.payment_status === "Nieopłacone"
  ).length;

  const activeCount = visibleOrders.filter(
    (order) =>
      order.status !== "Zrealizowane"
  ).length;

  const totalValue = visibleOrders.reduce(
    (sum, order) =>
      sum + Number(order.price || 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%),radial-gradient(circle_at_20%_90%,rgba(6,182,212,.07),transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-white/[.06] bg-[#0b0e14]/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-3 px-3 text-left"
        >
          <LogoMark />

          <div>
            <div className="text-sm font-black tracking-[.18em]">
              YOKAI OS
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-white/30">
              Wrap Intelligence
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push("/orders")}
          className="primary-button mt-8 w-full justify-center"
        >
          <ShoppingBag className="size-4" />
          Nowe zamówienie
        </button>

        <nav className="mt-6 space-y-1">
          {nav.map(
            ({
              label,
              icon: Icon,
              href,
              active,
            }) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                className={`nav-item ${
                  active
                    ? "nav-item-active"
                    : ""
                }`}
              >
                <Icon className="size-[18px]" />
                <span>{label}</span>

                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.9)]" />
                )}
              </button>
            )
          )}
        </nav>

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
                E
              </div>

              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  Emil
                </div>
                <div className="truncate text-xs text-white/35">
                  {email}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="nav-item"
          >
            <LogOut className="size-[18px]" />
            Wyloguj
          </button>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden">
          <button
            className="absolute inset-0"
            onClick={() => setMobileNav(false)}
            aria-label="Zamknij menu"
          />

          <div className="relative h-full w-[86%] max-w-[320px] border-r border-white/10 bg-[#0b0e14] p-5">
            <div className="mb-8 flex items-center justify-between">
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-3"
              >
                <LogoMark />
                <span className="font-black tracking-[.18em]">
                  YOKAI OS
                </span>
              </button>

              <button
                onClick={() => setMobileNav(false)}
                className="icon-button"
              >
                <X className="size-5" />
              </button>
            </div>

            <nav className="space-y-1">
              {nav.map(
                ({
                  label,
                  icon: Icon,
                  href,
                  active,
                }) => (
                  <button
                    key={label}
                    onClick={() => {
                      router.push(href);
                      setMobileNav(false);
                    }}
                    className={`nav-item ${
                      active
                        ? "nav-item-active"
                        : ""
                    }`}
                  >
                    <Icon className="size-[18px]" />
                    {label}
                  </button>
                )
              )}
            </nav>
          </div>
        </div>
      )}

      <div className="relative lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.055] bg-[#090b10]/80 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNav(true)}
              className="icon-button lg:hidden"
            >
              <Menu className="size-5" />
            </button>

            <div className="hidden text-sm text-white/35 sm:block">
              Centrum produkcji
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadOrders()}
              className="icon-button"
              title="Odśwież"
            >
              <RefreshCw
                className={`size-5 ${
                  loading
                    ? "animate-spin"
                    : ""
                }`}
              />
            </button>

            <button className="icon-button">
              <Bell className="size-5" />
            </button>
          </div>
        </header>

        <div className="px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/65">
                Realizacja zamówień
              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Produkcja
              </h1>

              <p className="mt-2 text-sm text-white/38">
                Przeciągaj zamówienia pomiędzy etapami.
                Zmiana zapisuje się automatycznie.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                {
                  value: "all",
                  label: "Wszystkie",
                },
                {
                  value: "woocommerce",
                  label: "WooCommerce",
                },
                {
                  value: "manual",
                  label: "Ręczne",
                },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() =>
                    setSourceFilter(
                      filter.value as
                        | "all"
                        | "woocommerce"
                        | "manual"
                    )
                  }
                  className={`secondary-button compact ${
                    sourceFilter === filter.value
                      ? "border-violet-400/30 bg-violet-400/[.08] text-violet-200"
                      : ""
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Aktywne",
                value: activeCount,
                icon: Zap,
                tone: "text-violet-300",
              },
              {
                label: "Po terminie",
                value: overdueCount,
                icon: Clock3,
                tone: "text-red-300",
              },
              {
                label: "Nieopłacone",
                value: unpaidCount,
                icon: CreditCard,
                tone: "text-amber-300",
              },
              {
                label: "Wartość",
                value: formatMoney(totalValue),
                icon: CircleDollarSign,
                tone: "text-emerald-300",
              },
            ].map(
              ({
                label,
                value,
                icon: Icon,
                tone,
              }) => (
                <div
                  key={label}
                  className="surface-card p-4"
                >
                  <Icon className={`size-4 ${tone}`} />
                  <div className="mt-5 text-2xl font-semibold tracking-tight">
                    {value}
                  </div>
                  <div className="mt-1 text-xs text-white/35">
                    {label}
                  </div>
                </div>
              )
            )}
          </section>

          <label className="relative mt-4 block max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              className="h-11 w-full rounded-2xl border border-white/[.07] bg-white/[.025] pl-11 pr-4 text-sm outline-none transition placeholder:text-white/25 focus:border-violet-400/45 focus:bg-violet-400/[.04]"
              placeholder="Szukaj zamówienia, klienta lub numeru..."
            />
          </label>

          <section className="mt-5 pb-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {columns.map((column) => {
                const columnOrders =
                  visibleOrders.filter(
                    (order) =>
                      order.status === column.status
                  );

                const isTarget =
                  dragTarget === column.status;

                return (
                  <section
                    key={column.status}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragTarget(column.status);
                    }}
                    onDragLeave={() => {
                      if (
                        dragTarget === column.status
                      ) {
                        setDragTarget(null);
                      }
                    }}
                    onDrop={(event) =>
                      handleDrop(
                        event,
                        column.status
                      )
                    }
                    className={`flex min-w-0 flex-col rounded-3xl border bg-[#0d1117]/90 p-3 transition ${
                      isTarget
                        ? "border-violet-400/55 bg-violet-400/[.055] shadow-[0_0_35px_rgba(139,92,246,.12)]"
                        : column.accent
                    }`}
                  >
                    <header className="mb-3 flex items-center justify-between px-1 py-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full ${column.dot}`}
                          />
                          <h2 className="text-sm font-semibold">
                            {column.label}
                          </h2>
                        </div>

                        <div className="mt-1 text-[10px] text-white/30">
                          {column.hint}
                        </div>
                      </div>

                      <span className="grid size-7 place-items-center rounded-full border border-white/[.07] bg-white/[.035] text-xs font-semibold text-white/55">
                        {columnOrders.length}
                      </span>
                    </header>

                    <div className="min-h-[360px] space-y-3 rounded-2xl">
                      {loading ? (
                        <div className="grid min-h-[220px] place-items-center">
                          <LoaderCircle className="size-5 animate-spin text-white/25" />
                        </div>
                      ) : columnOrders.length === 0 ? (
                        <div
                          className={`grid min-h-[130px] place-items-center rounded-2xl border border-dashed px-4 text-center text-xs transition ${
                            isTarget
                              ? "border-violet-400/35 text-violet-200"
                              : "border-white/[.06] text-white/20"
                          }`}
                        >
                          {isTarget
                            ? "Upuść tutaj"
                            : "Brak zamówień"}
                        </div>
                      ) : (
                        columnOrders.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            saving={
                              savingOrderId === order.id
                            }
                            onOpen={() =>
                              setSelected(order)
                            }
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed =
                                "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                String(order.id)
                              );
                              setDraggedOrderId(order.id);
                            }}
                            onDragEnd={() => {
                              setDraggedOrderId(null);
                              setDragTarget(null);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>

          <div className="mt-1 flex items-center gap-2 text-xs text-white/25">
            <Truck className="size-4" />
            Zamówienia anulowane są dostępne w module
            Zamówienia.
          </div>
        </div>
      </div>

      {selected && (
        <OrderDrawer
          order={selected}
          saving={savingOrderId === selected.id}
          onClose={() => setSelected(null)}
          onMove={(status) =>
            void moveOrder(selected, status)
          }
          onOpenOrders={() =>
            router.push(`/orders/${selected.id}`)
          }
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
          <PackageCheck className="size-5 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
