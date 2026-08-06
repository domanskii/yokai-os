"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  Command,
  FileImage,
  Gauge,
  LockKeyhole,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
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

type OrderStatus = "Projekt" | "Do cięcia" | "Pakowanie" | "Wysyłka";

type Order = {
  id: string;
  name: string;
  client: string;
  status: OrderStatus;
  price: number;
  source: string;
};

type ApiOrder = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  source: string;
  size: string | null;
  quantity: number;
  price: string | number;
  deadline: string | null;
  notes: string | null;
  status: OrderStatus;
  created_at: string;
};

type OrderPayload = {
  client_name: string;
  name: string;
  source: string;
  size: string | null;
  quantity: number;
  price: number;
  deadline: string | null;
  notes: string | null;
};

const demoOrders: Order[] = [
  { id: "DEMO-01254", name: "Instagram NFC", client: "Studio Lashes", status: "Do cięcia", price: 169, source: "WooCommerce" },
  { id: "DEMO-01253", name: "Stitch — bok auta", client: "Kamil", status: "Projekt", price: 620, source: "Face to face" },
  { id: "DEMO-01252", name: "JLo Skate", client: "Joanna", status: "Pakowanie", price: 149, source: "Instagram" },
  { id: "DEMO-01251", name: "Logo warsztatowe", client: "AutoLab", status: "Wysyłka", price: 289, source: "Messenger" },
];

const queue = [
  { id: "JOB-00124", name: "Instagram NFC", meta: "Biały / różowy · 5 szt.", accent: "from-fuchsia-500/35 via-pink-500/10 to-transparent" },
  { id: "JOB-00125", name: "Stitch Side", meta: "5 warstw · 60 cm", accent: "from-cyan-500/35 via-blue-500/10 to-transparent" },
  { id: "JOB-00126", name: "JLo Skate", meta: "Czarny / różowy", accent: "from-violet-500/35 via-fuchsia-500/10 to-transparent" },
];

const nav = [
  { label: "Dashboard", icon: Gauge, href: "/", active: true },
  { label: "Produkcja", icon: Zap, href: "/production" },
  { label: "Zamówienia", icon: ShoppingBag, href: "/orders" },
  { label: "Biblioteka SVG", icon: FileImage, href: "/" },
  { label: "Kalkulator", icon: CircleDollarSign, href: "/calculator" },
  { label: "Materiały", icon: Boxes, href: "/materials" },
  { label: "Klienci", icon: Users, href: "/" },
  { label: "AI Studio", icon: WandSparkles, href: "/" },
  { label: "Ustawienia", icon: Settings, href: "/" },
];

function apiOrderToOrder(order: ApiOrder): Order {
  return {
    id: order.order_number,
    name: order.name,
    client: order.client_name,
    status: order.status,
    price: Number(order.price),
    source: order.source,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatusPill({ status }: { status: OrderStatus }) {
  const className = {
    Projekt: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    "Do cięcia": "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
    Pakowanie: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    Wysyłka: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  }[status];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {status}
    </span>
  );
}

function LogoMark() {
  return (
    <div className="relative grid size-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,.18)]">
      <span className="text-lg font-black tracking-tighter text-white">Y</span>
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (token: string, email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Nie udało się zalogować");
      }

      localStorage.setItem("yokai_token", data.access_token);
      localStorage.setItem("yokai_email", data.user.email);
      onLogin(data.access_token, data.user.email);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Nie udało się zalogować");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#090b10] p-4 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(124,58,237,.20),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(6,182,212,.08),transparent_28%)]" />
      <form onSubmit={submit} className="surface-card relative z-10 w-full max-w-md p-7 sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark />
          <div>
            <div className="text-sm font-black tracking-[.18em]">YOKAI OS</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-white/30">Private Business System</div>
          </div>
        </div>

        <div className="mb-7">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/15 bg-violet-400/[.06] px-3 py-1 text-xs text-violet-200/75">
            <LockKeyhole className="size-3.5" />
            Dostęp chroniony
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Zaloguj się</h1>
          <p className="mt-2 text-sm text-white/38">Centrum dowodzenia YOKAI WRAP.</p>
        </div>

        <div className="space-y-4">
          <label className="field">
            <span>E-mail</span>
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@yokaiwrap.pl"
            />
          </label>
          <label className="field">
            <span>Hasło</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button disabled={loading} className="primary-button mt-6 w-full justify-center disabled:cursor-wait disabled:opacity-60">
          {loading ? "Logowanie..." : "Wejdź do YOKAI OS"}
        </button>
      </form>
    </main>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  hint: string;
  tone: string;
}) {
  return (
    <button className="group surface-card relative overflow-hidden p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-white/15">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${tone}`} />
      <div className="mb-8 flex items-start justify-between">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/8 bg-white/[.035]">
          <Icon className="size-5 text-white/80 transition group-hover:scale-110 group-hover:text-white" />
        </div>
        <ChevronRight className="size-4 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
      <div className="text-3xl font-semibold tracking-[-0.04em] text-white">{value}</div>
      <div className="mt-1 text-sm font-medium text-white/75">{label}</div>
      <div className="mt-3 text-xs text-white/35">{hint}</div>
    </button>
  );
}

function OrderModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: OrderPayload) => Promise<void>;
}) {
  const [form, setForm] = useState({
    client: "",
    name: "",
    source: "Face to face",
    size: "",
    quantity: "1",
    price: "",
    deadline: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const update = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      await onCreate({
        client_name: form.client || "Klient bez danych",
        name: form.name,
        source: form.source,
        size: form.size || null,
        quantity: Number(form.quantity || 1),
        price: Number(form.price || 0),
        deadline: form.deadline || null,
        notes: form.notes || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md animate-fade-in">
      <button aria-label="Zamknij" className="absolute inset-0" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#11151c] p-6 shadow-[0_28px_100px_rgba(0,0,0,.65)] sm:p-8">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-violet-300/70">Zamówienie ręczne</div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Nowe zlecenie</h2>
            <p className="mt-2 text-sm text-white/40">Dla klienta spoza sklepu lub zamówienia face to face.</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button"><X className="size-5" /></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Klient</span>
            <input value={form.client} onChange={(e) => update("client", e.target.value)} placeholder="Imię, firma lub bez danych" />
          </label>
          <label className="field">
            <span>Źródło</span>
            <select value={form.source} onChange={(e) => update("source", e.target.value)}>
              <option>Face to face</option>
              <option>Telefon</option>
              <option>Messenger</option>
              <option>Instagram</option>
              <option>Polecenie</option>
            </select>
          </label>
          <label className="field sm:col-span-2">
            <span>Nazwa zlecenia</span>
            <input required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="np. Naklejka Instagram NFC" />
          </label>
          <label className="field">
            <span>Wymiar</span>
            <input value={form.size} onChange={(e) => update("size", e.target.value)} placeholder="np. 54 × 10 cm" />
          </label>
          <label className="field">
            <span>Ilość</span>
            <input min="1" type="number" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} />
          </label>
          <label className="field">
            <span>Cena ustalona</span>
            <input min="0" step="0.01" type="number" value={form.price} onChange={(e) => update("price", e.target.value)} placeholder="0,00 zł" />
          </label>
          <label className="field">
            <span>Termin</span>
            <input type="date" value={form.deadline} onChange={(e) => update("deadline", e.target.value)} />
          </label>
          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Kolory, odbiór, link NFC, uwagi klienta..." />
          </label>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="secondary-button">Anuluj</button>
          <button disabled={saving} type="submit" className="primary-button disabled:cursor-wait disabled:opacity-60">
            <Plus className="size-4" />
            {saving ? "Zapisywanie..." : "Utwórz zamówienie"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [orders, setOrders] = useState<Order[]>(demoOrders);
  const [demoMode, setDemoMode] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const logout = () => {
    localStorage.removeItem("yokai_token");
    localStorage.removeItem("yokai_email");
    setToken(null);
    setEmail("");
    setOrders(demoOrders);
    setDemoMode(true);
  };

  const loadOrders = async (accessToken: string) => {
    const response = await fetch("/api/orders", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      throw new Error("Nie udało się pobrać zamówień");
    }

    const data: ApiOrder[] = await response.json();

    if (data.length === 0) {
      setOrders(demoOrders);
      setDemoMode(true);
    } else {
      setOrders(data.map(apiOrderToOrder));
      setDemoMode(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("yokai_token");
    const storedEmail = localStorage.getItem("yokai_email") || "";

    if (!storedToken) {
      setAuthReady(true);
      return;
    }

    setToken(storedToken);
    setEmail(storedEmail);
    loadOrders(storedToken)
      .catch(() => showToast("Nie udało się pobrać zamówień"))
      .finally(() => setAuthReady(true));
  }, []);

  const revenue = useMemo(() => orders.reduce((sum, order) => sum + order.price, 0), [orders]);

  const createOrder = async (payload: OrderPayload) => {
    if (!token) return;

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok) {
      throw new Error(data.detail || "Nie udało się utworzyć zamówienia");
    }

    const created = apiOrderToOrder(data);
    setOrders((current) => demoMode ? [created] : [created, ...current]);
    setDemoMode(false);
    setOrderModal(false);
    showToast(`Utworzono ${created.id}`);
  };

  if (!authReady) {
    return <main className="grid min-h-screen place-items-center bg-[#090b10] text-sm text-white/40">Uruchamianie YOKAI OS...</main>;
  }

  if (!token) {
    return (
      <LoginView
        onLogin={(accessToken, userEmail) => {
          setToken(accessToken);
          setEmail(userEmail);
          loadOrders(accessToken).catch(() => showToast("Nie udało się pobrać zamówień"));
        }}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%),radial-gradient(circle_at_20%_90%,rgba(6,182,212,.07),transparent_28%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-white/[.06] bg-[#0b0e14]/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-3">
          <LogoMark />
          <div>
            <div className="text-sm font-black tracking-[.18em]">YOKAI OS</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-white/30">Wrap Intelligence</div>
          </div>
        </div>

        <button onClick={() => setOrderModal(true)} className="primary-button mt-8 w-full justify-center">
          <Plus className="size-4" />
          Nowe zamówienie
        </button>

        <nav className="mt-6 space-y-1">
          {nav.map(({ label, icon: Icon, href, active }) => (
            <button onClick={() => router.push(href)} key={label} className={`nav-item ${active ? "nav-item-active" : ""}`}>
              <Icon className="size-[18px]" />
              <span>{label}</span>
              {active && <span className="ml-auto size-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.9)]" />}
            </button>
          ))}
        </nav>

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
              <div className="flex items-center gap-3"><LogoMark /><span className="font-black tracking-[.18em]">YOKAI OS</span></div>
              <button onClick={() => setMobileNav(false)} className="icon-button"><X className="size-5" /></button>
            </div>
            <button onClick={() => { setOrderModal(true); setMobileNav(false); }} className="primary-button mb-5 w-full justify-center">
              <Plus className="size-4" /> Nowe zamówienie
            </button>
            <nav className="space-y-1">
              {nav.map(({ label, icon: Icon, href, active }) => (
                <button onClick={() => router.push(href)} key={label} className={`nav-item ${active ? "nav-item-active" : ""}`}>
                  <Icon className="size-[18px]" /> {label}
                </button>
              ))}
              <button onClick={logout} className="nav-item"><LogOut className="size-[18px]" /> Wyloguj</button>
            </nav>
          </div>
        </div>
      )}

      <div className="relative lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.055] bg-[#090b10]/75 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNav(true)} className="icon-button lg:hidden"><Menu className="size-5" /></button>
            <div className="hidden text-sm text-white/35 sm:block">Dashboard</div>
          </div>

          <div className="flex items-center gap-2">
            <button className="hidden min-w-[280px] items-center gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-2.5 text-left text-sm text-white/35 transition hover:border-white/15 hover:bg-white/[.04] md:flex">
              <Search className="size-4" />
              <span>Znajdź projekt, zamówienie, klienta...</span>
              <span className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[.035] px-2 py-1 text-[10px] text-white/35">
                <Command className="size-3" /> K
              </span>
            </button>
            <button className="icon-button"><Bell className="size-5" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-fuchsia-400" /></button>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-1 text-xs text-emerald-300/80">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.9)]" />
                System działa prawidłowo
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Dzień dobry, Emil.</h1>
              <p className="mt-2 text-sm text-white/38">
                {demoMode ? "Dane demonstracyjne — utwórz pierwsze prawdziwe zamówienie." : "Zamówienia są zapisane w bazie YOKAI OS."}
              </p>
            </div>
            <button onClick={() => setOrderModal(true)} className="primary-button self-start md:self-auto lg:hidden">
              <Plus className="size-4" /> Nowe zamówienie
            </button>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={ShoppingBag} value={String(orders.length)} label="Aktywne zamówienia" hint={demoMode ? "Dane demonstracyjne" : "Zapisane w PostgreSQL"} tone="from-violet-500 via-fuchsia-400 to-transparent" />
            <StatCard icon={Zap} value={String(orders.filter((order) => order.status === "Do cięcia").length)} label="Do cięcia" hint="Kolejka produkcyjna" tone="from-cyan-400 via-blue-500 to-transparent" />
            <StatCard icon={Truck} value={String(orders.filter((order) => order.status === "Wysyłka").length)} label="Do wysyłki" hint="Odbiór InPost o 15:00" tone="from-emerald-400 via-teal-500 to-transparent" />
            <StatCard icon={CircleDollarSign} value={formatMoney(revenue)} label="Wartość zamówień" hint={demoMode ? "Dane demonstracyjne" : "Bieżąca baza"} tone="from-amber-400 via-orange-500 to-transparent" />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
            <div className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[.055] px-5 py-4 sm:px-6">
                <div><h2 className="font-semibold tracking-tight">Kolejka produkcji</h2><p className="mt-1 text-xs text-white/35">Najbliższe zlecenia w optymalnej kolejności</p></div>
                <button className="secondary-button compact">Otwórz produkcję</button>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                {queue.map((job, index) => (
                  <button key={job.id} className="group overflow-hidden rounded-[20px] border border-white/[.07] bg-black/20 text-left transition duration-200 hover:-translate-y-1 hover:border-white/15">
                    <div className={`relative aspect-[1.45] overflow-hidden bg-gradient-to-br ${job.accent}`}>
                      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:22px_22px]" />
                      <div className="absolute inset-0 grid place-items-center">
                        {index === 0 && <div className="rounded-2xl border-2 border-white/70 px-4 py-2 text-2xl font-black italic tracking-tight">IG</div>}
                        {index === 1 && <Sparkles className="size-14 text-white/75 drop-shadow-[0_0_18px_rgba(34,211,238,.55)]" />}
                        {index === 2 && <div className="text-center text-xl font-black tracking-tight"><span className="text-fuchsia-300">JLo</span><br/>SKATE</div>}
                      </div>
                      <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-medium backdrop-blur-md">#{index + 1}</div>
                    </div>
                    <div className="p-4">
                      <div className="text-[11px] font-medium tracking-[.14em] text-white/30">{job.id}</div>
                      <div className="mt-1 font-medium text-white/90">{job.name}</div>
                      <div className="mt-1 text-xs text-white/35">{job.meta}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="surface-card p-5 sm:p-6">
              <div className="mb-6 flex items-center justify-between">
                <div><h2 className="font-semibold tracking-tight">YOKAI Brain</h2><p className="mt-1 text-xs text-white/35">Sugestie dla dzisiejszej pracy</p></div>
                <div className="grid size-9 place-items-center rounded-2xl border border-violet-400/20 bg-violet-400/10"><Sparkles className="size-4 text-violet-300" /></div>
              </div>
              <div className="space-y-3">
                {[
                  ["Najpierw wytnij JOB-00124", "Kolejne zlecenie używa tych samych kolorów."],
                  ["Połącz 3 cięcia Oracal 070", "Szacowana oszczędność: 0,38 mb folii."],
                  ["Sprawdź termin YK-01253", "Klient czeka na akceptację projektu."],
                ].map(([title, text], index) => (
                  <button key={title} className="group flex w-full gap-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-3.5 text-left transition hover:border-violet-400/20 hover:bg-violet-400/[.045]">
                    <div className={`mt-1 size-2 shrink-0 rounded-full ${index === 2 ? "bg-amber-400" : "bg-violet-400"} shadow-[0_0_10px_currentColor]`} />
                    <div><div className="text-sm font-medium text-white/85">{title}</div><div className="mt-1 text-xs leading-5 text-white/35">{text}</div></div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
            <div className="surface-card p-5 sm:p-6">
              <div className="mb-7 flex items-start justify-between">
                <div><h2 className="font-semibold tracking-tight">Obrót w tym tygodniu</h2><p className="mt-1 text-xs text-white/35">Poniedziałek — niedziela</p></div>
                <div className="text-right"><div className="text-2xl font-semibold tracking-tight">{formatMoney(revenue)}</div><div className="mt-1 text-xs text-emerald-300">Dane z aktywnych zamówień</div></div>
              </div>
              <div className="relative h-[190px]">
                <div className="absolute inset-0 flex flex-col justify-between">{[0, 1, 2, 3].map((line) => <div key={line} className="h-px bg-white/[.055]" />)}</div>
                <svg viewBox="0 0 600 190" className="absolute inset-0 h-full w-full overflow-visible">
                  <defs>
                    <linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".34" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient>
                    <filter id="glow"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  </defs>
                  <path d="M0,145 C45,132 60,92 110,108 C160,124 175,72 230,82 C285,92 300,42 355,58 C410,74 442,28 485,45 C530,62 552,35 600,18 L600,190 L0,190 Z" fill="url(#chartArea)" />
                  <path d="M0,145 C45,132 60,92 110,108 C160,124 175,72 230,82 C285,92 300,42 355,58 C410,74 442,28 485,45 C530,62 552,35 600,18" fill="none" stroke="#9f7aea" strokeWidth="4" strokeLinecap="round" filter="url(#glow)" />
                </svg>
                <div className="absolute inset-x-0 -bottom-6 flex justify-between text-[10px] uppercase tracking-wider text-white/25">{["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((day) => <span key={day}>{day}</span>)}</div>
              </div>
            </div>

            <div className="surface-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[.055] px-5 py-4 sm:px-6">
                <div><h2 className="font-semibold tracking-tight">Ostatnie zamówienia</h2><p className="mt-1 text-xs text-white/35">{demoMode ? "Dane demonstracyjne" : "Sklep i zlecenia ręczne w jednym miejscu"}</p></div>
                <button onClick={() => router.push("/orders")} className="secondary-button compact">Wszystkie</button>
              </div>
              <div className="divide-y divide-white/[.045]">
                {orders.slice(0, 5).map((order) => (
                  <button key={order.id} className="group grid w-full grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[.025] sm:grid-cols-[110px_1fr_120px_100px] sm:px-6">
                    <div className="hidden text-xs font-medium text-white/35 sm:block">{order.id}</div>
                    <div className="min-w-0"><div className="truncate text-sm font-medium text-white/85">{order.name}</div><div className="mt-1 truncate text-xs text-white/30">{order.client} · {order.source}</div></div>
                    <div className="hidden sm:block"><StatusPill status={order.status} /></div>
                    <div className="text-right text-sm font-semibold text-white/80">{formatMoney(order.price)}</div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {orderModal && <OrderModal onClose={() => setOrderModal(false)} onCreate={createOrder} />}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-toast">
          <PackageCheck className="size-5 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </main>
  );
}
