"use client";

import { SidebarAttentionBadge } from "../../components/sidebar-attention-badge";

import { BulkOperationsButton } from "../../components/bulk-operations-button";

import { ManualOrderClientSearch } from "../../components/manual-order-client-search";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Banknote,
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileImage,
  Gauge,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

type OrderStatus =
  | "Nowe"
  | "Projekt"
  | "Produkcja"
  | "Gotowe"
  | "Zrealizowane"
  | "Anulowane";

type PaymentStatus = "Nieopłacone" | "Zaliczka" | "Opłacone" | "Zwrot";

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

type Stats = {
  active: number;
  cutting: number;
  shipping: number;
  unpaid: number;
  total_value: string | number;
  paid_value: string | number;
  status_counts: Record<string, number>;
};

type WooSyncStatus = {
  configured: boolean;
  interval_minutes: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_received: number;
  last_created: number;
  last_updated: number;
  is_running: boolean;
  trigger: string | null;
};

const statuses: OrderStatus[] = [
  "Nowe",
  "Projekt",
  "Produkcja",
  "Gotowe",
  "Zrealizowane",
  "Anulowane",
];

const paymentStatuses: PaymentStatus[] = [
  "Nieopłacone",
  "Zaliczka",
  "Opłacone",
  "Zwrot",
];

const nav = [
  { label: "Dashboard", icon: Gauge, href: "/" },
  { label: "Produkcja", icon: Zap, href: "/production" },
  { label: "Zamówienia", icon: ShoppingBag, href: "/orders", active: true },
  { label: "Biblioteka SVG", icon: FileImage, href: "/library" },
  { label: "Kalkulator", icon: CircleDollarSign, href: "/calculator" },
  { label: "Materiały", icon: Boxes, href: "/materials" },
  { label: "Klienci", icon: Users, href: "/clients" },
  { label: "Finanse", icon: CircleDollarSign, href: "/finance" },
  { label: "AI Studio", icon: WandSparkles, href: "/" },
  { label: "Ustawienia", icon: Settings, href: "/" },
];

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : 0;
}

function formatDate(value: string | null) {
  if (!value) return "Brak terminu";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSyncDate(value: string | null) {
  if (!value) return "jeszcze nie wykonano";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function LogoMark() {
  return (
    <div className="relative grid size-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,.18)]">
      <span className="text-lg font-black tracking-tighter text-white">Y</span>
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const className =
    {
      Nowe: "border-sky-400/25 bg-sky-400/10 text-sky-200",
      Projekt: "border-violet-400/25 bg-violet-400/10 text-violet-200",
      Produkcja: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
      Gotowe: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      Zrealizowane: "border-green-400/25 bg-green-400/10 text-green-200",
      Anulowane: "border-red-400/25 bg-red-400/10 text-red-200",
    }[status] ?? "border-white/10 bg-white/5 text-white/60";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

function PaymentPill({ status }: { status: PaymentStatus }) {
  const className =
    {
      Nieopłacone: "border-red-400/25 bg-red-400/10 text-red-200",
      Zaliczka: "border-amber-400/25 bg-amber-400/10 text-amber-200",
      Opłacone: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
      Zwrot: "border-slate-400/25 bg-slate-400/10 text-slate-200",
    }[status];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

function NewOrderModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (order: ApiOrder) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    client_name: "",
    name: "",
    source: "Face to face",
    size: "",
    quantity: "1",
    price: "",
    paid_amount: "",
    payment_status: "Nieopłacone" as PaymentStatus,
    deadline: "",
    notes: "",
  });

  const update = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: form.client_name || "Klient bez danych",
          name: form.name,
          source: form.source,
          size: form.size || null,
          quantity: Number(form.quantity || 1),
          price: parseMoney(form.price),
          paid_amount: parseMoney(form.paid_amount),
          payment_status: form.payment_status,
          deadline: form.deadline || null,
          notes: form.notes || null,
          status: "Projekt",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Nie udało się utworzyć zamówienia");
      }

      onCreated(data);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się utworzyć zamówienia"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
      <button className="absolute inset-0" onClick={onClose} aria-label="Zamknij" />
      <form
        onSubmit={submit}
        className="surface-card relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"
      >
        <div className="mb-7 flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              Zamówienie ręczne
            </div>
            <h2 className="mt-2 text-2xl font-semibold">Nowe zlecenie</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Klient</span>
            <div className="relative">
              <input id="manual-order-client-name"
              value={form.client_name}
              onChange={(event) => update("client_name", event.target.value)}
              placeholder="Imię lub firma"
            />
              <ManualOrderClientSearch inputId="manual-order-client-name" />
            </div>
          </label>
          <label className="field">
            <span>Źródło</span>
            <select value={form.source} onChange={(event) => update("source", event.target.value)}>
              <option>Face to face</option>
              <option>Telefon</option>
              <option>Messenger</option>
              <option>Instagram</option>
              <option>Polecenie</option>
            </select>
          </label>
          <label className="field sm:col-span-2">
            <span>Nazwa zlecenia</span>
            <input
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="np. Naklejka Instagram NFC"
            />
          </label>
          <label className="field">
            <span>Wymiar</span>
            <input
              value={form.size}
              onChange={(event) => update("size", event.target.value)}
              placeholder="np. 54 × 10 cm"
            />
          </label>
          <label className="field">
            <span>Ilość</span>
            <input
              min="1"
              type="number"
              value={form.quantity}
              onChange={(event) => update("quantity", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Cena</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => update("price", event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            <span>Wpłacono</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.paid_amount}
              onChange={(event) => update("paid_amount", event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            <span>Płatność</span>
            <select
              value={form.payment_status}
              onChange={(event) => update("payment_status", event.target.value)}
            >
              {paymentStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Termin</span>
            <input
              type="date"
              value={form.deadline}
              onChange={(event) => update("deadline", event.target.value)}
            />
          </label>
          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Kolory, odbiór, link NFC, uwagi..."
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="secondary-button">
            Anuluj
          </button>
          <button disabled={saving} className="primary-button disabled:opacity-60">
            <Plus className="size-4" />
            {saving ? "Zapisywanie..." : "Utwórz zamówienie"}
          </button>
        </div>
      </form>
    </div>
  );
}

function OrderDrawer({
  token,
  order,
  onClose,
  onSaved,
  onArchived,
}: {
  token: string;
  order: ApiOrder;
  onClose: () => void;
  onSaved: (order: ApiOrder) => void;
  onArchived: (order: ApiOrder) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    client_name: order.client_name,
    name: order.name,
    source: order.source,
    size: order.size || "",
    quantity: String(order.quantity),
    price: String(order.price),
    paid_amount: String(order.paid_amount),
    payment_status: order.payment_status,
    deadline: order.deadline || "",
    notes: order.notes || "",
    status: order.status,
  });

  const update = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_name: form.client_name,
          name: form.name,
          source: form.source,
          size: form.size || null,
          quantity: Number(form.quantity),
          price: parseMoney(form.price),
          paid_amount: parseMoney(form.paid_amount),
          payment_status: form.payment_status,
          deadline: form.deadline || null,
          notes: form.notes || null,
          status: form.status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Nie udało się zapisać zmian");
      }

      onSaved(data);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nie udało się zapisać zmian"
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setArchiving(true);
    setError("");

    try {
      const action = order.is_archived ? "restore" : "archive";
      const response = await fetch(`/api/orders/${order.id}/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Operacja nie powiodła się");
      }

      onArchived(data);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Operacja nie powiodła się"
      );
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] bg-black/65 backdrop-blur-sm animate-fade-in">
      <button className="absolute inset-0" onClick={onClose} aria-label="Zamknij" />
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 shadow-2xl animate-drawer sm:p-7">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              {order.order_number}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{order.name}</h2>
            <p className="mt-2 text-sm text-white/35">
              Utworzono {formatDateTime(order.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="icon-button">
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">Wartość</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(order.price)}</div>
          </div>
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">Wpłacono</div>
            <div className="mt-2 text-xl font-semibold">{formatMoney(order.paid_amount)}</div>
          </div>
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-xs text-white/35">Termin</div>
            <div className="mt-2 text-sm font-semibold">{formatDate(order.deadline)}</div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Klient</span>
            <input value={form.client_name} onChange={(event) => update("client_name", event.target.value)} />
          </label>
          <label className="field">
            <span>Źródło</span>
            <input value={form.source} onChange={(event) => update("source", event.target.value)} />
          </label>
          <label className="field sm:col-span-2">
            <span>Nazwa zlecenia</span>
            <input value={form.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label className="field">
            <span>Status produkcji</span>
            <select value={form.status} onChange={(event) => update("status", event.target.value)}>
              {statuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status płatności</span>
            <select value={form.payment_status} onChange={(event) => update("payment_status", event.target.value)}>
              {paymentStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Wymiar</span>
            <input value={form.size} onChange={(event) => update("size", event.target.value)} />
          </label>
          <label className="field">
            <span>Ilość</span>
            <input min="1" type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} />
          </label>
          <label className="field">
            <span>Cena</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => update("price", event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            <span>Wpłacono</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.paid_amount}
              onChange={(event) => update("paid_amount", event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label className="field">
            <span>Termin</span>
            <input type="date" value={form.deadline} onChange={(event) => update("deadline", event.target.value)} />
          </label>
          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea rows={5} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            window.location.assign(
              `/orders/${order.id}`
            )
          }
          className="secondary-button mt-6 w-full justify-center"
        >
          <ShoppingBag className="size-4" />
          Otwórz pełną kartę zamówienia
        </button>

        <div className="mt-7 flex flex-col-reverse justify-between gap-3 sm:flex-row">
          <button
            onClick={archive}
            disabled={archiving}
            className="secondary-button text-red-200 hover:border-red-400/25 hover:bg-red-400/[.06]"
          >
            {order.is_archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
            {archiving
              ? "Przetwarzanie..."
              : order.is_archived
                ? "Przywróć"
                : "Archiwizuj"}
          </button>
          <button onClick={save} disabled={saving} className="primary-button">
            <PencilLine className="size-4" />
            {saving ? "Zapisywanie..." : "Zapisz zmiany"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<ApiOrder | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [newOrder, setNewOrder] = useState(false);
  const [importingWoo, setImportingWoo] = useState(false);
  const [wooSync, setWooSync] = useState<WooSyncStatus | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const logout = () => {
    localStorage.removeItem("yokai_token");
    localStorage.removeItem("yokai_email");
    router.replace("/");
  };

  const authorizedFetch = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      logout();
      throw new Error("Sesja wygasła");
    }

    return response;
  };

  const loadWooSync = async () => {
    if (!token) return;

    try {
      const response = await authorizedFetch(
        "/api/woocommerce/sync-status"
      );

      if (response.ok) {
        setWooSync(await response.json());
      }
    } catch {
      // Główna lista zamówień pozostaje dostępna.
    }
  };

  const loadData = async () => {
    if (!token) return;
    setLoading(true);

    const params = new URLSearchParams({
      archived: String(showArchived),
      limit: "300",
    });

    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("order_status", statusFilter);
    if (paymentFilter) params.set("payment_status", paymentFilter);

    try {
      const [ordersResponse, statsResponse] = await Promise.all([
        authorizedFetch(`/api/orders?${params.toString()}`),
        authorizedFetch("/api/orders/stats"),
      ]);

      if (!ordersResponse.ok || !statsResponse.ok) {
        throw new Error("Nie udało się pobrać zamówień");
      }

      setOrders(await ordersResponse.json());
      setStats(await statsResponse.json());
    } catch (loadError) {
      showToast(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać zamówień"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("yokai_token");
    const storedEmail = localStorage.getItem("yokai_email") || "";

    if (!storedToken) {
      router.replace("/");
      return;
    }

    setToken(storedToken);
    setEmail(storedEmail);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, search ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [token, search, statusFilter, paymentFilter, showArchived]);

  useEffect(() => {
    if (!token) return;

    loadWooSync();

    const timer = window.setInterval(
      loadWooSync,
      30000
    );

    return () => window.clearInterval(timer);
  }, [token]);


  useEffect(() => {
    if (!token || orders.length === 0) {
      return;
    }

    const query = new URLSearchParams(
      window.location.search
    );

    const editOrderId = Number(
      query.get("edit") || 0
    );

    if (!editOrderId) {
      return;
    }

    const targetOrder = orders.find(
      (order) => order.id === editOrderId
    );

    if (!targetOrder) {
      return;
    }

    setSelected(targetOrder);

    window.history.replaceState(
      {},
      "",
      "/orders"
    );
  }, [token, orders]);

  const filteredValue = useMemo(
    () => orders.reduce((sum, order) => sum + Number(order.price), 0),
    [orders]
  );

  const importWooCommerce = async () => {
    setImportingWoo(true);

    try {
      const response = await authorizedFetch(
        "/api/woocommerce/import?limit=100",
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Nie udało się zaimportować zamówień"
        );
      }

      showToast(
        `WooCommerce: ${data.created} nowych, ${data.updated} zaktualizowanych`
      );

      await loadData();
      await loadWooSync();
    } catch (importError) {
      showToast(
        importError instanceof Error
          ? importError.message
          : "Nie udało się zaimportować zamówień"
      );
    } finally {
      setImportingWoo(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%),radial-gradient(circle_at_20%_90%,rgba(6,182,212,.07),transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-white/[.06] bg-[#0b0e14]/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <button onClick={() => router.push("/")} className="flex items-center gap-3 px-3 text-left">
          <LogoMark />
          <div>
            <div className="text-sm font-black tracking-[.18em]">YOKAI OS</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-white/30">Wrap Intelligence</div>
          </div>
        </button>

        <button onClick={() => setNewOrder(true)} className="primary-button mt-8 w-full justify-center">
          <Plus className="size-4" />
          Nowe zamówienie
        </button>

        <nav className="mt-6 space-y-1">
          {nav.map(({ label, icon: Icon, href, active }) => (
            <button
              key={label}
              onClick={() => router.push(href)}
              className={`nav-item ${active ? "nav-item-active" : ""}`}
            >
              <Icon className="size-[18px]" />
              <span>{label}</span>
              {active && (
                <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.9)]" />
              )}
            </button>
          ))}
        </nav>
      <SidebarAttentionBadge />

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">E</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Emil</div>
                <div className="truncate text-xs text-white/35">{email}</div>
              </div>
            </div>
          </div>
          <button onClick={logout} className="nav-item">
            <LogOut className="size-[18px]" />
            Wyloguj
          </button>
        </div>
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden">
          <button className="absolute inset-0" onClick={() => setMobileNav(false)} aria-label="Zamknij menu" />
          <div className="relative h-full w-[86%] max-w-[320px] border-r border-white/10 bg-[#0b0e14] p-5 animate-slide-in">
            <div className="mb-8 flex items-center justify-between">
              <button onClick={() => router.push("/")} className="flex items-center gap-3">
                <LogoMark />
                <span className="font-black tracking-[.18em]">YOKAI OS</span>
              </button>
              <button onClick={() => setMobileNav(false)} className="icon-button">
                <X className="size-5" />
              </button>
            </div>
            <button
              onClick={() => {
                setNewOrder(true);
                setMobileNav(false);
              }}
              className="primary-button mb-5 w-full justify-center"
            >
              <Plus className="size-4" />
              Nowe zamówienie
            </button>
            <nav className="space-y-1">
              {nav.map(({ label, icon: Icon, href, active }) => (
                <button
                  key={label}
                  onClick={() => router.push(href)}
                  className={`nav-item ${active ? "nav-item-active" : ""}`}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="relative lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.055] bg-[#090b10]/75 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNav(true)} className="icon-button lg:hidden">
              <Menu className="size-5" />
            </button>
            <button onClick={() => router.push("/")} className="hidden items-center gap-2 text-sm text-white/35 hover:text-white/70 sm:flex">
              <ArrowLeft className="size-4" />
              Dashboard
            </button>
          </div>
          <button className="icon-button">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/65">
                Moduł sprzedaży
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Zamówienia
              </h1>
              <p className="mt-2 text-sm text-white/38">
                Sklep, polecenia i zlecenia bezpośrednie w jednym miejscu.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[.06] px-2.5 py-1 text-emerald-200">
                  Auto-sync co {wooSync?.interval_minutes ?? 10} min
                </span>

                <span className="text-white/35">
                  Ostatnio:{" "}
                  {formatSyncDate(
                    wooSync?.last_success_at ?? null
                  )}
                </span>

                {wooSync?.is_running && (
                  <span className="text-violet-300">
                    Synchronizacja trwa...
                  </span>
                )}

                {wooSync?.last_error && (
                  <span
                    className="max-w-xl truncate text-red-300"
                    title={wooSync.last_error}
                  >
                    Błąd: {wooSync.last_error}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 self-start md:self-auto">
              <button
                onClick={importWooCommerce}
                disabled={importingWoo}
                className="secondary-button disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw
                  className={`size-4 ${importingWoo ? "animate-spin" : ""}`}
                />
                {importingWoo
                  ? "Importowanie..."
                  : "Importuj z WooCommerce"}
              </button>

              <button
                onClick={() => setNewOrder(true)}
                className="primary-button"
              >
                <Plus className="size-4" />
                Nowe zamówienie
              </button>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Aktywne",
                value: stats?.active ?? 0,
                icon: ShoppingBag,
                tone: "text-violet-300",
              },
              {
                label: "Do cięcia",
                value: stats?.cutting ?? 0,
                icon: Zap,
                tone: "text-cyan-300",
              },
              {
                label: "Do wysyłki",
                value: stats?.shipping ?? 0,
                icon: Truck,
                tone: "text-emerald-300",
              },
              {
                label: "Nieopłacone",
                value: stats?.unpaid ?? 0,
                icon: Banknote,
                tone: "text-red-300",
              },
              {
                label: "Wartość",
                value: formatMoney(stats?.total_value ?? 0),
                icon: CircleDollarSign,
                tone: "text-amber-300",
              },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="surface-card p-4">
                <Icon className={`size-4 ${tone}`} />
                <div className="mt-5 text-2xl font-semibold tracking-tight">
                  {value}
                </div>
                <div className="mt-1 text-xs text-white/35">{label}</div>
              </div>
            ))}
          </section>

          <section className="surface-card mt-4 overflow-hidden">
            <div className="border-b border-white/[.055] p-4 sm:p-5">
              <div className="grid gap-3 xl:grid-cols-[1fr_190px_190px_auto]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-white/[.07] bg-white/[.025] pl-11 pr-4 text-sm outline-none transition placeholder:text-white/25 focus:border-violet-400/45 focus:bg-violet-400/[.04]"
                    placeholder="Szukaj po numerze, kliencie lub nazwie..."
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-white/[.07] bg-[#11151c] px-4 text-sm text-white/70 outline-none focus:border-violet-400/45"
                >
                  <option value="">Wszystkie statusy</option>
                  {statuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={paymentFilter}
                  onChange={(event) => setPaymentFilter(event.target.value)}
                  className="h-11 rounded-2xl border border-white/[.07] bg-[#11151c] px-4 text-sm text-white/70 outline-none focus:border-violet-400/45"
                >
                  <option value="">Wszystkie płatności</option>
                  {paymentStatuses.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowArchived((current) => !current)}
                  className={`secondary-button ${showArchived ? "border-violet-400/30 bg-violet-400/[.08] text-violet-200" : ""}`}
                >
                  <Archive className="size-4" />
                  {showArchived ? "Archiwum" : "Pokaż archiwum"}
                </button>
              </div>
            </div>

            <div className="hidden grid-cols-[110px_1.25fr_1fr_140px_135px_120px_30px] gap-4 border-b border-white/[.045] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.15em] text-white/25 xl:grid">
              <div>Numer</div>
              <div>Zlecenie</div>
              <div>Klient</div>
              <div>Produkcja</div>
              <div>Płatność</div>
              <div className="text-right">Wartość</div>
              <div />
            </div>

            {loading ? (
              <div className="grid min-h-[300px] place-items-center">
                <div className="flex items-center gap-3 text-sm text-white/35">
                  <LoaderCircle className="size-5 animate-spin" />
                  Pobieranie zamówień...
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="grid min-h-[300px] place-items-center px-5 text-center">
                <div>
                  <ShoppingBag className="mx-auto size-9 text-white/20" />
                  <div className="mt-4 font-medium">Brak zamówień</div>
                  <div className="mt-2 text-sm text-white/35">Zmień filtry albo utwórz nowe zlecenie.</div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[.045]">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelected(order)}
                    className="group grid w-full gap-3 px-5 py-4 text-left transition hover:bg-white/[.025] xl:grid-cols-[110px_1.25fr_1fr_140px_135px_120px_30px] xl:items-center xl:gap-4"
                  >
                    <div className="flex items-center justify-between xl:block">
                      <div className="text-xs font-semibold text-white/45">{order.order_number}</div>
                      <ChevronRight className="size-4 text-white/20 xl:hidden" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white/88">{order.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/30">
                        <span>{order.source}</span>
                        <span>·</span>
                        <span>{order.quantity} szt.</span>
                        {order.size && (
                          <>
                            <span>·</span>
                            <span>{order.size}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="truncate text-sm text-white/55">{order.client_name}</div>
                    <div><StatusPill status={order.status} /></div>
                    <div><PaymentPill status={order.payment_status} /></div>
                    <div className="text-sm font-semibold text-white/80 xl:text-right">{formatMoney(order.price)}</div>
                    <ChevronRight className="hidden size-4 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-white/50 xl:block" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col justify-between gap-2 border-t border-white/[.05] px-5 py-4 text-xs text-white/30 sm:flex-row">
              <span>{orders.length} pozycji</span>
              <span>Wartość widocznych: {formatMoney(filteredValue)}</span>
            </div>
          </section>
        </div>
      </div>

      {newOrder && (
        <NewOrderModal
          token={token}
          onClose={() => setNewOrder(false)}
          onCreated={(order) => {
            setNewOrder(false);
            showToast(`Utworzono ${order.order_number}`);
            loadData();
          }}
        />
      )}

      {selected && (
        <OrderDrawer
          token={token}
          order={selected}
          onClose={() => setSelected(null)}
          onSaved={(order) => {
            setSelected(order);
            setOrders((current) =>
              current.map((item) => (item.id === order.id ? order : item))
            );
            showToast(`Zapisano ${order.order_number}`);
            loadData();
          }}
          onArchived={(order) => {
            setSelected(null);
            showToast(order.is_archived ? "Zamówienie zarchiwizowane" : "Zamówienie przywrócone");
            loadData();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[80] flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-toast">
          <PackageCheck className="size-5 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
          <BulkOperationsButton entity="orders" />
</main>
  );
}
