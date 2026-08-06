"use client";

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
  FileImage,
  Gauge,
  Layers3,
  LoaderCircle,
  LogOut,
  Menu,
  PackageOpen,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  TriangleAlert,
  Users,
  WandSparkles,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";

type Material = {
  id: number;
  name: string;
  brand: string;
  series: string;
  category: string;
  color_name: string;
  color_code: string;
  width_cm: number;
  roll_length_m: number;
  purchase_price: number;
  stock_length_m: number;
  low_stock_threshold_m: number;
  supplier: string;
  notes: string | null;
  is_archived: boolean;
  roll_area_m2: number;
  stock_area_m2: number;
  cost_per_m2: number;
  estimated_stock_value: number;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
};

type MaterialStats = {
  total_materials: number;
  low_stock: number;
  stock_area_m2: number;
  estimated_stock_value: number;
};

type MaterialForm = {
  name: string;
  brand: string;
  series: string;
  category: string;
  color_name: string;
  color_code: string;
  width_cm: string;
  roll_length_m: string;
  purchase_price: string;
  stock_length_m: string;
  low_stock_threshold_m: string;
  supplier: string;
  notes: string;
};

type IconComponent = ComponentType<LucideProps>;

type NavItem = {
  label: string;
  icon: IconComponent;
  href: string;
  active?: boolean;
};

const emptyForm: MaterialForm = {
  name: "",
  brand: "",
  series: "",
  category: "Folia ploterowa",
  color_name: "",
  color_code: "",
  width_cm: "",
  roll_length_m: "",
  purchase_price: "",
  stock_length_m: "",
  low_stock_threshold_m: "5",
  supplier: "",
  notes: "",
};

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
    active: true,
  },
  {
    label: "Klienci",
    icon: Users,
    href: "/clients",
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

function parseNumber(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  const result = Number(normalized);

  return Number.isFinite(result)
    ? result
    : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatNumber(
  value: number,
  digits = 2
) {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function LogoMark() {
  return (
    <div className="relative grid size-10 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,.18)]">
      <span className="text-lg font-black tracking-tighter">
        Y
      </span>
      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: IconComponent;
  tone: string;
}) {
  return (
    <div className="surface-card p-4">
      <Icon className={`size-4 ${tone}`} />
      <div className="mt-5 text-2xl font-semibold tracking-tight">
        {value}
      </div>
      <div className="mt-1 text-xs text-white/35">
        {label}
      </div>
    </div>
  );
}

function MaterialModal({
  token,
  material,
  onClose,
  onSaved,
}: {
  token: string;
  material: Material | null;
  onClose: () => void;
  onSaved: (material: Material) => void;
}) {
  const [form, setForm] =
    useState<MaterialForm>(emptyForm);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!material) {
      setForm(emptyForm);
      return;
    }

    setForm({
      name: material.name,
      brand: material.brand,
      series: material.series,
      category: material.category,
      color_name: material.color_name,
      color_code: material.color_code,
      width_cm: String(material.width_cm),
      roll_length_m: String(
        material.roll_length_m
      ),
      purchase_price: String(
        material.purchase_price
      ),
      stock_length_m: String(
        material.stock_length_m
      ),
      low_stock_threshold_m: String(
        material.low_stock_threshold_m
      ),
      supplier: material.supplier,
      notes: material.notes || "",
    });
  }, [material]);

  const update = (
    field: keyof MaterialForm,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyPreset = (
    preset: "551" | "951" | "MT80"
  ) => {
    if (preset === "551") {
      setForm((current) => ({
        ...current,
        name: "ORACAL 551",
        brand: "ORACAL",
        series: "551",
        category: "Folia ploterowa",
      }));
    }

    if (preset === "951") {
      setForm((current) => ({
        ...current,
        name: "ORACAL 951",
        brand: "ORACAL",
        series: "951",
        category: "Folia ploterowa",
      }));
    }

    if (preset === "MT80") {
      setForm((current) => ({
        ...current,
        name: "ORATAPE MT80",
        brand: "ORATAPE",
        series: "MT80",
        category: "Folia transferowa",
      }));
    }
  };

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        material
          ? `/api/materials/${material.id}`
          : "/api/materials",
        {
          method: material
            ? "PATCH"
            : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name,
            brand: form.brand,
            series: form.series,
            category: form.category,
            color_name: form.color_name,
            color_code: form.color_code,
            width_cm: parseNumber(
              form.width_cm
            ),
            roll_length_m: parseNumber(
              form.roll_length_m
            ),
            purchase_price: parseNumber(
              form.purchase_price
            ),
            stock_length_m: parseNumber(
              form.stock_length_m
            ),
            low_stock_threshold_m:
              parseNumber(
                form.low_stock_threshold_m
              ),
            supplier: form.supplier,
            notes: form.notes || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : "Nie udało się zapisać materiału";

        throw new Error(detail);
      }

      onSaved(data);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nie udało się zapisać materiału"
      );
    } finally {
      setSaving(false);
    }
  };

  const width = parseNumber(form.width_cm);
  const rollLength = parseNumber(
    form.roll_length_m
  );
  const price = parseNumber(
    form.purchase_price
  );

  const rollArea =
    (width / 100) * rollLength;

  const calculatedCost =
    rollArea > 0
      ? price / rollArea
      : 0;

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              {material
                ? "Edycja materiału"
                : "Nowy materiał"}
            </div>
            <h2 className="mt-2 text-2xl font-semibold">
              {material
                ? material.name
                : "Dodaj folię lub transfer"}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-button"
          >
            <X className="size-5" />
          </button>
        </div>

        {!material && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                applyPreset("551")
              }
              className="secondary-button compact"
            >
              ORACAL 551
            </button>
            <button
              type="button"
              onClick={() =>
                applyPreset("951")
              }
              className="secondary-button compact"
            >
              ORACAL 951
            </button>
            <button
              type="button"
              onClick={() =>
                applyPreset("MT80")
              }
              className="secondary-button compact"
            >
              ORATAPE MT80
            </button>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Nazwa materiału</span>
            <input
              required
              value={form.name}
              onChange={(event) =>
                update(
                  "name",
                  event.target.value
                )
              }
              placeholder="np. ORACAL 551 Czarny"
            />
          </label>

          <label className="field">
            <span>Kategoria</span>
            <select
              value={form.category}
              onChange={(event) =>
                update(
                  "category",
                  event.target.value
                )
              }
            >
              <option>Folia ploterowa</option>
              <option>Folia transferowa</option>
              <option>Folia laminacyjna</option>
              <option>Inne</option>
            </select>
          </label>

          <label className="field">
            <span>Dostawca</span>
            <input
              value={form.supplier}
              onChange={(event) =>
                update(
                  "supplier",
                  event.target.value
                )
              }
              placeholder="np. Plastics"
            />
          </label>

          <label className="field">
            <span>Marka</span>
            <input
              value={form.brand}
              onChange={(event) =>
                update(
                  "brand",
                  event.target.value
                )
              }
              placeholder="ORACAL"
            />
          </label>

          <label className="field">
            <span>Seria</span>
            <input
              value={form.series}
              onChange={(event) =>
                update(
                  "series",
                  event.target.value
                )
              }
              placeholder="551"
            />
          </label>

          <label className="field">
            <span>Nazwa koloru</span>
            <input
              value={form.color_name}
              onChange={(event) =>
                update(
                  "color_name",
                  event.target.value
                )
              }
              placeholder="Czarny"
            />
          </label>

          <label className="field">
            <span>Kod koloru</span>
            <input
              value={form.color_code}
              onChange={(event) =>
                update(
                  "color_code",
                  event.target.value
                )
              }
              placeholder="070"
            />
          </label>

          <label className="field">
            <span>Szerokość rolki [cm]</span>
            <input
              required
              inputMode="decimal"
              value={form.width_cm}
              onChange={(event) =>
                update(
                  "width_cm",
                  event.target.value
                )
              }
              placeholder="63"
            />
          </label>

          <label className="field">
            <span>Długość pełnej rolki [m]</span>
            <input
              required
              inputMode="decimal"
              value={form.roll_length_m}
              onChange={(event) =>
                update(
                  "roll_length_m",
                  event.target.value
                )
              }
              placeholder="50"
            />
          </label>

          <label className="field">
            <span>Cena zakupu rolki [zł]</span>
            <input
              inputMode="decimal"
              value={form.purchase_price}
              onChange={(event) =>
                update(
                  "purchase_price",
                  event.target.value
                )
              }
              placeholder="0,00"
            />
          </label>

          <label className="field">
            <span>Aktualny stan [m]</span>
            <input
              inputMode="decimal"
              value={form.stock_length_m}
              onChange={(event) =>
                update(
                  "stock_length_m",
                  event.target.value
                )
              }
              placeholder="50"
            />
          </label>

          <label className="field">
            <span>Alarm niskiego stanu [m]</span>
            <input
              inputMode="decimal"
              value={
                form.low_stock_threshold_m
              }
              onChange={(event) =>
                update(
                  "low_stock_threshold_m",
                  event.target.value
                )
              }
              placeholder="5"
            />
          </label>

          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[.04] p-4">
            <div className="text-xs text-white/35">
              Obliczony koszt
            </div>
            <div className="mt-2 text-xl font-semibold text-violet-200">
              {formatMoney(
                calculatedCost
              )}{" "}
              / m²
            </div>
            <div className="mt-1 text-xs text-white/30">
              Powierzchnia rolki:{" "}
              {formatNumber(
                rollArea,
                3
              )}{" "}
              m²
            </div>
          </div>

          <label className="field sm:col-span-2">
            <span>Notatki</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                update(
                  "notes",
                  event.target.value
                )
              }
              placeholder="Uwagi dotyczące materiału..."
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="secondary-button"
          >
            Anuluj
          </button>

          <button
            disabled={saving}
            className="primary-button disabled:opacity-60"
          >
            <PencilLine className="size-4" />
            {saving
              ? "Zapisywanie..."
              : material
                ? "Zapisz zmiany"
                : "Dodaj materiał"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MaterialsPage() {
  const router = useRouter();

  const [token, setToken] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [materials, setMaterials] =
    useState<Material[]>([]);

  const [stats, setStats] =
    useState<MaterialStats | null>(null);

  const [search, setSearch] =
    useState("");

  const [showArchived, setShowArchived] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [mobileNav, setMobileNav] =
    useState(false);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [editing, setEditing] =
    useState<Material | null>(null);

  const [toast, setToast] =
    useState("");

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

  const loadData = async () => {
    if (!token) return;

    setLoading(true);

    try {
      const [
        materialsResponse,
        statsResponse,
      ] = await Promise.all([
        authorizedFetch(
          `/api/materials?archived=${showArchived}`
        ),
        authorizedFetch(
          "/api/materials/stats"
        ),
      ]);

      if (
        !materialsResponse.ok ||
        !statsResponse.ok
      ) {
        throw new Error(
          "Nie udało się pobrać materiałów"
        );
      }

      setMaterials(
        await materialsResponse.json()
      );

      setStats(
        await statsResponse.json()
      );
    } catch (loadError) {
      showToast(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać materiałów"
      );
    } finally {
      setLoading(false);
    }
  };

  const archiveMaterial = async (
    material: Material
  ) => {
    try {
      const action =
        material.is_archived
          ? "restore"
          : "archive";

      const response = await authorizedFetch(
        `/api/materials/${material.id}/${action}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Operacja nie powiodła się"
        );
      }

      showToast(
        material.is_archived
          ? "Materiał przywrócony"
          : "Materiał zarchiwizowany"
      );

      await loadData();
    } catch (archiveError) {
      showToast(
        archiveError instanceof Error
          ? archiveError.message
          : "Operacja nie powiodła się"
      );
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
    void loadData();
  }, [token, showArchived]);

  const visibleMaterials = useMemo(() => {
    const phrase = search
      .trim()
      .toLocaleLowerCase("pl");

    if (!phrase) return materials;

    return materials.filter((material) =>
      [
        material.name,
        material.brand,
        material.series,
        material.category,
        material.color_name,
        material.color_code,
        material.supplier,
      ]
        .join(" ")
        .toLocaleLowerCase("pl")
        .includes(phrase)
    );
  }, [materials, search]);

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
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="primary-button mt-8 w-full justify-center"
        >
          <Plus className="size-4" />
          Dodaj materiał
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
                onClick={() =>
                  router.push(href)
                }
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
            <div className="text-sm font-medium">
              Emil
            </div>
            <div className="mt-1 truncate text-xs text-white/35">
              {email}
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
            onClick={() =>
              setMobileNav(false)
            }
            aria-label="Zamknij menu"
          />

          <div className="relative h-full w-[86%] max-w-[320px] border-r border-white/10 bg-[#0b0e14] p-5">
            <div className="mb-8 flex items-center justify-between">
              <LogoMark />

              <button
                onClick={() =>
                  setMobileNav(false)
                }
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
          <button
            onClick={() =>
              setMobileNav(true)
            }
            className="icon-button lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden text-sm text-white/35 lg:block">
            Magazyn i koszty materiałów
          </div>

          <button className="icon-button">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/65">
                Magazyn YOKAI WRAP
              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Materiały
              </h1>

              <p className="mt-2 text-sm text-white/38">
                Rolki folii, stan magazynowy i rzeczywisty koszt za m².
              </p>
            </div>

            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="primary-button self-start md:self-auto"
            >
              <Plus className="size-4" />
              Dodaj materiał
            </button>
          </section>

          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Materiały"
              value={
                stats?.total_materials ?? 0
              }
              icon={Layers3}
              tone="text-violet-300"
            />

            <StatCard
              label="Niski stan"
              value={stats?.low_stock ?? 0}
              icon={TriangleAlert}
              tone="text-red-300"
            />

            <StatCard
              label="Powierzchnia na stanie"
              value={`${formatNumber(
                stats?.stock_area_m2 ?? 0
              )} m²`}
              icon={PackageOpen}
              tone="text-cyan-300"
            />

            <StatCard
              label="Wartość magazynu"
              value={formatMoney(
                stats?.estimated_stock_value ??
                  0
              )}
              icon={CircleDollarSign}
              tone="text-emerald-300"
            />
          </section>

          <section className="surface-card mt-4 overflow-hidden">
            <div className="grid gap-3 border-b border-white/[.055] p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />

                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  className="h-11 w-full rounded-2xl border border-white/[.07] bg-white/[.025] pl-11 pr-4 text-sm outline-none transition placeholder:text-white/25 focus:border-violet-400/45"
                  placeholder="Szukaj folii, serii, koloru lub kodu..."
                />
              </label>

              <button
                onClick={() =>
                  setShowArchived(
                    (current) => !current
                  )
                }
                className={`secondary-button ${
                  showArchived
                    ? "border-violet-400/30 bg-violet-400/[.08] text-violet-200"
                    : ""
                }`}
              >
                <Archive className="size-4" />
                {showArchived
                  ? "Archiwum"
                  : "Pokaż archiwum"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[1.5fr_120px_115px_115px_120px_120px_125px_50px] gap-4 border-b border-white/[.045] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.15em] text-white/25">
                  <div>Materiał</div>
                  <div>Rozmiar rolki</div>
                  <div>Stan</div>
                  <div>Koszt / m²</div>
                  <div>Cena rolki</div>
                  <div>Powierzchnia</div>
                  <div>Wartość stanu</div>
                  <div />
                </div>

                {loading ? (
                  <div className="grid min-h-[320px] place-items-center">
                    <LoaderCircle className="size-6 animate-spin text-white/25" />
                  </div>
                ) : visibleMaterials.length ===
                  0 ? (
                  <div className="grid min-h-[320px] place-items-center text-center">
                    <div>
                      <Boxes className="mx-auto size-10 text-white/15" />
                      <div className="mt-4 font-medium">
                        Brak materiałów
                      </div>
                      <div className="mt-2 text-sm text-white/35">
                        Dodaj pierwszą rolkę folii.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[.045]">
                    {visibleMaterials.map(
                      (material) => (
                        <button
                          key={material.id}
                          onClick={() => {
                            setEditing(material);
                            setModalOpen(true);
                          }}
                          className="group grid w-full grid-cols-[1.5fr_120px_115px_115px_120px_120px_125px_50px] items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[.025]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {material.color_code.startsWith(
                                "#"
                              ) && (
                                <span
                                  className="size-4 shrink-0 rounded-full border border-white/15"
                                  style={{
                                    backgroundColor:
                                      material.color_code,
                                  }}
                                />
                              )}

                              <span className="truncate text-sm font-semibold text-white/85">
                                {material.name}
                              </span>
                            </div>

                            <div className="mt-1 truncate text-xs text-white/30">
                              {[
                                material.category,
                                material.brand,
                                material.series,
                                material.color_name,
                                material.color_code,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>

                          <div className="text-sm text-white/55">
                            {formatNumber(
                              material.width_cm
                            )}{" "}
                            cm ×{" "}
                            {formatNumber(
                              material.roll_length_m
                            )}{" "}
                            m
                          </div>

                          <div>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${
                                material.is_low_stock
                                  ? "border-red-400/25 bg-red-400/[.07] text-red-200"
                                  : "border-emerald-400/20 bg-emerald-400/[.06] text-emerald-200"
                              }`}
                            >
                              {formatNumber(
                                material.stock_length_m
                              )}{" "}
                              m
                            </span>
                          </div>

                          <div className="text-sm font-semibold text-violet-200">
                            {formatMoney(
                              material.cost_per_m2
                            )}
                          </div>

                          <div className="text-sm text-white/60">
                            {formatMoney(
                              material.purchase_price
                            )}
                          </div>

                          <div className="text-sm text-white/55">
                            {formatNumber(
                              material.stock_area_m2
                            )}{" "}
                            m²
                          </div>

                          <div className="text-sm font-semibold text-white/75">
                            {formatMoney(
                              material.estimated_stock_value
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void archiveMaterial(
                                material
                              );
                            }}
                            className="icon-button"
                            title={
                              material.is_archived
                                ? "Przywróć"
                                : "Archiwizuj"
                            }
                          >
                            {material.is_archived ? (
                              <RotateCcw className="size-4" />
                            ) : (
                              <Archive className="size-4" />
                            )}
                          </button>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/[.05] px-5 py-4 text-xs text-white/30">
              {visibleMaterials.length} pozycji
            </div>
          </section>
        </div>
      </div>

      {modalOpen && (
        <MaterialModal
          token={token}
          material={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSaved={(material) => {
            setModalOpen(false);
            setEditing(null);

            showToast(
              `Zapisano: ${material.name}`
            );

            void loadData();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
          {toast}
        </div>
      )}
    </main>
  );
}
