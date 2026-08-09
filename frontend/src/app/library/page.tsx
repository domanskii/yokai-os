"use client";

import { SidebarAttentionBadge } from "../../components/sidebar-attention-badge";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  Boxes,
  CircleDollarSign,
  Download,
  FileImage,
  FolderOpen,
  Gauge,
  HardDrive,
  ImageIcon,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  PencilLine,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Tags,
  Upload,
  Users,
  WandSparkles,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";

type IconComponent = ComponentType<LucideProps>;

type Order = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
};

type SvgAsset = {
  id: number;
  asset_number: string;
  name: string;
  original_filename: string;
  file_size: number;
  category: string;
  tags: string[];
  client_name: string;
  order_id: number | null;
  order_number: string | null;
  order_name: string | null;
  version_label: string;
  svg_width: string | null;
  svg_height: string | null;
  view_box: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

type Stats = {
  active: number;
  assigned: number;
  categories: number;
  total_size: number;
};

type NavItem = {
  label: string;
  icon: IconComponent;
  href: string;
  active?: boolean;
};

const nav: NavItem[] = [
  { label: "Dashboard", icon: Gauge, href: "/" },
  { label: "Produkcja", icon: Zap, href: "/production" },
  { label: "Zamówienia", icon: ShoppingBag, href: "/orders" },
  {
    label: "Biblioteka SVG",
    icon: FileImage,
    href: "/library",
    active: true,
  },
  {
    label: "Kalkulator",
    icon: CircleDollarSign,
    href: "/calculator",
  },
  { label: "Materiały", icon: Boxes, href: "/materials" },
  { label: "Klienci", icon: Users, href: "/clients" },
  { label: "Finanse", icon: CircleDollarSign, href: "/finance" },
  { label: "AI Studio", icon: WandSparkles, href: "/" },
  { label: "Ustawienia", icon: Settings, href: "/" },
];

const categories = [
  "Naklejka social media",
  "Logo",
  "Tekst",
  "Grafika",
  "Motoryzacja",
  "Inne",
];

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function apiError(
  response: Response,
  fallback: string
) {
  const contentType =
    response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const data = await response.json();
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } else {
    await response.text();
  }

  return fallback;
}

function LogoMark() {
  return (
    <div className="relative grid size-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,.18)]">
      <span className="text-lg font-black tracking-tighter">Y</span>
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

function SvgPreview({
  assetId,
  token,
  className,
}: {
  assetId: number;
  token: string;
  className: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/svg-assets/${assetId}/file`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) throw new Error();

        objectUrl = URL.createObjectURL(
          await response.blob()
        );

        if (!cancelled) setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, token]);

  return (
    <div
      className={`grid place-items-center overflow-hidden bg-white/[.025] ${className}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt="Podgląd SVG"
          className="size-full object-contain p-5"
          onError={() => setFailed(true)}
        />
      ) : failed ? (
        <ImageIcon className="size-9 text-white/15" />
      ) : (
        <LoaderCircle className="size-6 animate-spin text-white/20" />
      )}
    </div>
  );
}

function UploadModal({
  token,
  orders,
  onClose,
  onCreated,
}: {
  token: string;
  orders: Order[];
  onClose: () => void;
  onCreated: (asset: SvgAsset) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Grafika");
  const [tags, setTags] = useState("");
  const [clientName, setClientName] = useState("");
  const [orderId, setOrderId] = useState("");
  const [versionLabel, setVersionLabel] = useState("v1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const order = orders.find(
      (item) => String(item.id) === orderId
    );
    if (order) setClientName(order.client_name);
  }, [orderId, orders]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!file) {
      setError("Wybierz plik SVG");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const data = new FormData();
      data.append("file", file);
      data.append(
        "name",
        name.trim() || file.name.replace(/\.svg$/i, "")
      );
      data.append("category", category);
      data.append("tags", tags);
      data.append("client_name", clientName);
      data.append("version_label", versionLabel);
      data.append("notes", notes);
      if (orderId) data.append("order_id", orderId);

      const response = await fetch("/api/svg-assets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: data,
      });

      if (!response.ok) {
        throw new Error(
          await apiError(
            response,
            "Nie udało się dodać projektu"
          )
        );
      }

      onCreated(await response.json());
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się dodać projektu"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <form
        onSubmit={submit}
        className="surface-card relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto p-6 sm:p-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              Nowy projekt
            </div>
            <h2 className="mt-2 text-2xl font-semibold">
              Dodaj plik SVG
            </h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button">
            <X className="size-5" />
          </button>
        </div>

        <label className="mt-6 grid min-h-[145px] cursor-pointer place-items-center rounded-3xl border border-dashed border-violet-400/25 bg-violet-400/[.035] p-5 text-center">
          <input
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const selected =
                event.target.files?.[0] || null;
              setFile(selected);
              if (selected && !name.trim()) {
                setName(
                  selected.name.replace(/\.svg$/i, "")
                );
              }
            }}
          />
          <div>
            <Upload className="mx-auto size-8 text-violet-300" />
            <div className="mt-3 font-medium">
              {file ? file.name : "Kliknij i wybierz plik SVG"}
            </div>
            <div className="mt-2 text-xs text-white/35">
              Maksymalnie 10 MB
            </div>
          </div>
        </label>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Nazwa projektu</span>
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Kategoria</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Wersja</span>
            <input
              value={versionLabel}
              onChange={(event) =>
                setVersionLabel(event.target.value)
              }
            />
          </label>

          <label className="field sm:col-span-2">
            <span>Zamówienie</span>
            <select
              value={orderId}
              onChange={(event) =>
                setOrderId(event.target.value)
              }
            >
              <option value="">Bez przypisania</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.order_number} · {order.client_name} · {order.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Klient</span>
            <input
              value={clientName}
              onChange={(event) =>
                setClientName(event.target.value)
              }
            />
          </label>

          <label className="field">
            <span>Tagi</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="instagram, nfc, logo"
            />
          </label>

          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
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
            <Upload className="size-4" />
            {saving ? "Dodawanie..." : "Dodaj projekt"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssetDrawer({
  token,
  asset,
  orders,
  onClose,
  onChanged,
}: {
  token: string;
  asset: SvgAsset;
  orders: Order[];
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [clientName, setClientName] = useState(asset.client_name);
  const [orderId, setOrderId] = useState(
    asset.order_id ? String(asset.order_id) : ""
  );
  const [versionLabel, setVersionLabel] = useState(
    asset.version_label
  );
  const [notes, setNotes] = useState(asset.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/svg-assets/${asset.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            category,
            tags: tags
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
            client_name: clientName,
            order_id: orderId ? Number(orderId) : null,
            version_label: versionLabel,
            notes: notes || null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await apiError(
            response,
            "Nie udało się zapisać zmian"
          )
        );
      }

      onChanged(`Zapisano ${asset.asset_number}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nie udało się zapisać zmian"
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    setError("");

    try {
      const action = asset.is_archived
        ? "restore"
        : "archive";

      const response = await fetch(
        `/api/svg-assets/${asset.id}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          await apiError(response, "Operacja nie powiodła się")
        );
      }

      onChanged(
        asset.is_archived
          ? "Projekt przywrócony"
          : "Projekt zarchiwizowany"
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Operacja nie powiodła się"
      );
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const response = await fetch(
      `/api/svg-assets/${asset.id}/file?download=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      setError(
        await apiError(response, "Nie udało się pobrać SVG")
      );
      return;
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = asset.original_filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />
      <aside className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 sm:p-7">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              {asset.asset_number}
            </div>
            <h2 className="mt-2 text-2xl font-semibold">
              {asset.name}
            </h2>
            <div className="mt-2 text-xs text-white/35">
              {asset.original_filename} · {formatFileSize(asset.file_size)}
            </div>
          </div>
          <button onClick={onClose} className="icon-button">
            <X className="size-5" />
          </button>
        </div>

        <SvgPreview
          assetId={asset.id}
          token={token}
          className="mt-6 aspect-[16/10] rounded-3xl border border-white/[.07]"
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Nazwa</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label className="field">
            <span>Kategoria</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Wersja</span>
            <input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
            />
          </label>

          <label className="field sm:col-span-2">
            <span>Zamówienie</span>
            <select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                const order = orders.find(
                  (item) => String(item.id) === e.target.value
                );
                if (order) setClientName(order.client_name);
              }}
            >
              <option value="">Bez przypisania</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.order_number} · {order.client_name} · {order.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Klient</span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Tagi</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>

          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button onClick={download} className="secondary-button justify-center">
            <Download className="size-4" />
            Pobierz SVG
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="primary-button justify-center disabled:opacity-60"
          >
            <PencilLine className="size-4" />
            Zapisz zmiany
          </button>
        </div>

        <button
          onClick={toggleArchive}
          disabled={busy}
          className="secondary-button mt-3 w-full justify-center text-red-200 disabled:opacity-60"
        >
          <Archive className="size-4" />
          {asset.is_archived
            ? "Przywróć projekt"
            : "Archiwizuj projekt"}
        </button>
      </aside>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [assets, setAssets] = useState<SvgAsset[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<SvgAsset | null>(null);
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

  const authorizedFetch = async (url: string) => {
    const response = await fetch(url, {
      headers: {
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

  const loadData = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const [assetsResponse, ordersResponse, statsResponse] =
        await Promise.all([
          authorizedFetch(
            `/api/svg-assets?archived=${showArchived}&limit=500`
          ),
          authorizedFetch(
            "/api/orders?archived=false&limit=500"
          ),
          authorizedFetch("/api/svg-assets/stats"),
        ]);

      if (
        !assetsResponse.ok ||
        !ordersResponse.ok ||
        !statsResponse.ok
      ) {
        throw new Error("Nie udało się pobrać biblioteki SVG");
      }

      setAssets(await assetsResponse.json());
      setOrders(await ordersResponse.json());
      setStats(await statsResponse.json());
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać biblioteki"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("yokai_token");
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
    void loadData();
  }, [token, showArchived]);

  const visibleAssets = useMemo(() => {
    const phrase = search.trim().toLocaleLowerCase("pl");

    if (!phrase) return assets;

    return assets.filter((asset) =>
      [
        asset.asset_number,
        asset.name,
        asset.original_filename,
        asset.category,
        asset.client_name,
        asset.order_number || "",
        asset.version_label,
        ...asset.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("pl")
        .includes(phrase)
    );
  }, [assets, search]);

  const cards: Array<{
    label: string;
    value: string | number;
    icon: IconComponent;
    tone: string;
  }> = [
    {
      label: "Aktywne projekty",
      value: stats?.active ?? 0,
      icon: FileImage,
      tone: "text-violet-300",
    },
    {
      label: "Przypisane",
      value: stats?.assigned ?? 0,
      icon: ShoppingBag,
      tone: "text-cyan-300",
    },
    {
      label: "Kategorie",
      value: stats?.categories ?? 0,
      icon: Tags,
      tone: "text-amber-300",
    },
    {
      label: "Rozmiar biblioteki",
      value: formatFileSize(stats?.total_size ?? 0),
      icon: HardDrive,
      tone: "text-emerald-300",
    },
  ];

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%)]" />

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
          onClick={() => setUploadOpen(true)}
          className="primary-button mt-8 w-full justify-center"
        >
          <Plus className="size-4" />
          Dodaj projekt
        </button>

        <nav className="mt-6 space-y-1">
          {nav.map(({ label, icon: Icon, href, active }) => (
            <button
              key={label}
              onClick={() => router.push(href)}
              className={`nav-item ${
                active ? "nav-item-active" : ""
              }`}
            >
              <Icon className="size-[18px]" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      <SidebarAttentionBadge />

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4">
            <div className="text-sm font-medium">Emil</div>
            <div className="mt-1 truncate text-xs text-white/35">
              {email}
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
          <button
            className="absolute inset-0"
            onClick={() => setMobileNav(false)}
            aria-label="Zamknij"
          />
          <div className="relative h-full w-[86%] max-w-[320px] bg-[#0b0e14] p-5">
            <div className="mb-8 flex justify-between">
              <LogoMark />
              <button
                onClick={() => setMobileNav(false)}
                className="icon-button"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {nav.map(({ label, icon: Icon, href, active }) => (
                <button
                  key={label}
                  onClick={() => {
                    router.push(href);
                    setMobileNav(false);
                  }}
                  className={`nav-item ${
                    active ? "nav-item-active" : ""
                  }`}
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
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.055] bg-[#090b10]/80 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
          <button
            onClick={() => setMobileNav(true)}
            className="icon-button lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden text-sm text-white/35 lg:block">
            Projekty gotowe do produkcji
          </div>
          <button className="icon-button">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/65">
                Projekty YOKAI WRAP
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Biblioteka SVG
              </h1>
              <p className="mt-2 text-sm text-white/38">
                Podgląd, wersje, tagi i przypisanie do zamówień.
              </p>
            </div>

            <button
              onClick={() => setUploadOpen(true)}
              className="primary-button self-start md:self-auto"
            >
              <Upload className="size-4" />
              Dodaj projekt SVG
            </button>
          </section>

          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="surface-card p-4">
                <Icon className={`size-4 ${tone}`} />
                <div className="mt-5 text-2xl font-semibold">
                  {value}
                </div>
                <div className="mt-1 text-xs text-white/35">
                  {label}
                </div>
              </div>
            ))}
          </section>

          <section className="surface-card mt-4 overflow-hidden">
            <div className="grid gap-3 border-b border-white/[.055] p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/[.07] bg-white/[.025] pl-11 pr-4 text-sm outline-none focus:border-violet-400/45"
                  placeholder="Szukaj nazwy, klienta, zamówienia lub tagu..."
                />
              </label>

              <button
                onClick={() =>
                  setShowArchived((current) => !current)
                }
                className={`secondary-button ${
                  showArchived
                    ? "border-violet-400/30 bg-violet-400/[.08] text-violet-200"
                    : ""
                }`}
              >
                <Archive className="size-4" />
                {showArchived ? "Archiwum" : "Pokaż archiwum"}
              </button>
            </div>

            {loading ? (
              <div className="grid min-h-[420px] place-items-center">
                <LoaderCircle className="size-7 animate-spin text-white/25" />
              </div>
            ) : visibleAssets.length === 0 ? (
              <div className="grid min-h-[420px] place-items-center text-center">
                <div>
                  <FolderOpen className="mx-auto size-11 text-white/15" />
                  <div className="mt-4 font-medium">
                    Brak projektów SVG
                  </div>
                  <div className="mt-2 text-sm text-white/35">
                    Dodaj pierwszy plik gotowy do cięcia.
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {visibleAssets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => setSelected(asset)}
                    className="group overflow-hidden rounded-3xl border border-white/[.065] bg-[#10141b] text-left transition hover:-translate-y-0.5 hover:border-violet-400/30"
                  >
                    <SvgPreview
                      assetId={asset.id}
                      token={token}
                      className="aspect-[4/3] border-b border-white/[.055]"
                    />
                    <div className="p-4">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[.15em] text-violet-300/60">
                            {asset.asset_number}
                          </div>
                          <div className="mt-1 truncate text-sm font-semibold">
                            {asset.name}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-white/[.08] px-2 py-1 text-[10px] text-white/45">
                          {asset.version_label}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-violet-400/20 bg-violet-400/[.06] px-2 py-1 text-[10px] text-violet-200">
                          {asset.category}
                        </span>
                        {asset.order_number && (
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[.06] px-2 py-1 text-[10px] text-cyan-200">
                            {asset.order_number}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex justify-between border-t border-white/[.055] pt-3 text-[11px] text-white/30">
                        <span className="truncate">
                          {asset.client_name || "Bez klienta"}
                        </span>
                        <span>{formatFileSize(asset.file_size)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-white/[.05] px-5 py-4 text-xs text-white/30">
              {visibleAssets.length} projektów
            </div>
          </section>
        </div>
      </div>

      {uploadOpen && (
        <UploadModal
          token={token}
          orders={orders}
          onClose={() => setUploadOpen(false)}
          onCreated={(asset) => {
            setUploadOpen(false);
            showToast(`Dodano ${asset.asset_number}`);
            void loadData();
          }}
        />
      )}

      {selected && (
        <AssetDrawer
          token={token}
          asset={selected}
          orders={orders}
          onClose={() => setSelected(null)}
          onChanged={(message) => {
            setSelected(null);
            showToast(message);
            void loadData();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl">
          <PackageCheck className="size-5 text-emerald-400" />
          {toast}
        </div>
      )}
    </main>
  );
}
