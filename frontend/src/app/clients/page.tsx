"use client";

import { SidebarAttentionBadge } from "../../components/sidebar-attention-badge";

import { BulkOperationsButton } from "../../components/bulk-operations-button";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  Boxes,
  Building2,
  CircleDollarSign,
  FileImage,
  Gauge,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  PackageCheck,
  PencilLine,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  UserRound,
  Users,
  WandSparkles,
  X,
  Zap,
  type LucideProps,
} from "lucide-react";

type IconComponent = ComponentType<LucideProps>;

type Client = {
  id: number;
  client_number: string;
  client_type: "person" | "company";
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  display_name: string;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  vat_status: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  notes: string | null;
  is_archived: boolean;
  order_count: number;
  order_value: number;
};

type ClientStats = {
  active: number;
  companies: number;
  people: number;
  linked_orders: number;
  linked_value: number;
};

type ClientOrder = {
  id: number;
  order_number: string;
  name: string;
  status: string;
  price: number;
  created_at: string;
};

type LookupResult = {
  source: string;
  lookup_date: string;
  request_id: string | null;
  cached: boolean;
  company_name: string | null;
  nip: string;
  regon: string | null;
  krs: string | null;
  vat_status: string | null;
  working_address: string | null;
  residence_address: string | null;
  address: string | null;
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
  { label: "Biblioteka SVG", icon: FileImage, href: "/library" },
  { label: "Kalkulator", icon: CircleDollarSign, href: "/calculator" },
  { label: "Materiały", icon: Boxes, href: "/materials" },
  {
    label: "Klienci",
    icon: Users,
    href: "/clients",
    active: true,
  },
  { label: "Finanse", icon: CircleDollarSign, href: "/finance" },
  { label: "AI Studio", icon: WandSparkles, href: "/ai-studio" },
  { label: "Ustawienia", icon: Settings, href: "/" },
];

function money(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value || 0);
}

function date(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
  }).format(new Date(value));
}

async function readError(
  response: Response,
  fallback: string
) {
  const type =
    response.headers.get("content-type") || "";

  if (type.includes("application/json")) {
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
      <span className="text-lg font-black tracking-tighter">
        Y
      </span>

      <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_14px_rgba(232,121,249,.9)]" />
    </div>
  );
}

const emptyForm = {
  client_type: "person" as "person" | "company",
  first_name: "",
  last_name: "",
  company_name: "",
  nip: "",
  regon: "",
  krs: "",
  vat_status: "",
  email: "",
  phone: "",
  address: "",
  postal_code: "",
  city: "",
  country: "Polska",
  notes: "",
};

function ClientModal({
  token,
  client,
  onClose,
  onSaved,
  onChanged,
}: {
  token: string;
  client: Client | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onChanged: (message: string) => void;
}) {
  const router = useRouter();

  const [form, setForm] = useState(
    client
      ? {
          client_type: client.client_type,
          first_name: client.first_name || "",
          last_name: client.last_name || "",
          company_name: client.company_name || "",
          nip: client.nip || "",
          regon: client.regon || "",
          krs: client.krs || "",
          vat_status: client.vat_status || "",
          email: client.email || "",
          phone: client.phone || "",
          address: client.address || "",
          postal_code: client.postal_code || "",
          city: client.city || "",
          country: client.country || "Polska",
          notes: client.notes || "",
        }
      : emptyForm
  );

  const [lookup, setLookup] =
    useState<LookupResult | null>(null);

  const [orders, setOrders] =
    useState<ClientOrder[]>([]);

  const [saving, setSaving] =
    useState(false);

  const [lookingUp, setLookingUp] =
    useState(false);

  const [creatingOrder, setCreatingOrder] =
    useState(false);

  const [error, setError] =
    useState("");

  const update = (
    key: keyof typeof form,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  useEffect(() => {
    if (!client) return;

    const loadOrders = async () => {
      const response = await fetch(
        `/api/clients/${client.id}/orders`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (response.ok) {
        setOrders(await response.json());
      }
    };

    void loadOrders();
  }, [client, token]);

  const lookupNip = async () => {
    const nip = form.nip.replace(/\D/g, "");

    if (nip.length !== 10) {
      setError("NIP musi mieć 10 cyfr");
      return;
    }

    setLookingUp(true);
    setLookup(null);
    setError("");

    try {
      const response = await fetch(
        `/api/company-lookup/nip/${nip}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie znaleziono danych firmy"
          )
        );
      }

      setLookup(await response.json());
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Nie udało się pobrać danych firmy"
      );
    } finally {
      setLookingUp(false);
    }
  };

  const applyLookup = () => {
    if (!lookup) return;

    setForm((current) => ({
      ...current,
      client_type: "company",
      company_name:
        lookup.company_name || current.company_name,
      nip: lookup.nip || current.nip,
      regon: lookup.regon || "",
      krs: lookup.krs || "",
      vat_status: lookup.vat_status || "",
      address: lookup.address || "",
    }));

    setLookup(null);
  };

  const save = async (
    event: FormEvent
  ) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        client
          ? `/api/clients/${client.id}`
          : "/api/clients",
        {
          method: client
            ? "PATCH"
            : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się zapisać klienta"
          )
        );
      }

      const saved: Client =
        await response.json();

      onSaved(
        client
          ? `Zapisano ${saved.client_number}`
          : `Dodano ${saved.client_number}`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nie udało się zapisać klienta"
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!client) return;

    setSaving(true);
    setError("");

    try {
      const action =
        client.is_archived
          ? "restore"
          : "archive";

      const response = await fetch(
        `/api/clients/${client.id}/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Operacja nie powiodła się"
          )
        );
      }

      onChanged(
        client.is_archived
          ? "Klient przywrócony"
          : "Klient zarchiwizowany"
      );
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Operacja nie powiodła się"
      );
    } finally {
      setSaving(false);
    }
  };

  const createOrder = async () => {
    if (!client) return;

    setCreatingOrder(true);
    setError("");

    try {
      const response = await fetch(
        `/api/clients/${client.id}/create-order`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się utworzyć zamówienia"
          )
        );
      }

      const order = await response.json();

      router.push(
        `/orders/${order.id}`
      );
    } catch (orderError) {
      setError(
        orderError instanceof Error
          ? orderError.message
          : "Nie udało się utworzyć zamówienia"
      );
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <aside className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
              {client
                ? client.client_number
                : "Nowy klient"}
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              {client
                ? client.display_name
                : "Dodaj klienta"}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="icon-button"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          onSubmit={save}
          className="mt-6"
        >
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[.07] bg-white/[.025] p-1.5">
            <button
              type="button"
              onClick={() =>
                update(
                  "client_type",
                  "person"
                )
              }
              className={`rounded-xl px-4 py-2.5 text-sm transition ${
                form.client_type === "person"
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-white/40"
              }`}
            >
              <UserRound className="mr-2 inline size-4" />
              Osoba
            </button>

            <button
              type="button"
              onClick={() =>
                update(
                  "client_type",
                  "company"
                )
              }
              className={`rounded-xl px-4 py-2.5 text-sm transition ${
                form.client_type === "company"
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-white/40"
              }`}
            >
              <Building2 className="mr-2 inline size-4" />
              Firma
            </button>
          </div>

          {form.client_type === "company" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="field sm:col-span-2">
                <span>Nazwa firmy</span>

                <input
                  required
                  value={form.company_name}
                  onChange={(event) =>
                    update(
                      "company_name",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="field sm:col-span-2">
                <span>NIP</span>

                <div className="flex gap-2">
                  <input
                    value={form.nip}
                    onChange={(event) =>
                      update(
                        "nip",
                        event.target.value
                      )
                    }
                    placeholder="10 cyfr"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      void lookupNip()
                    }
                    disabled={lookingUp}
                    className="secondary-button shrink-0 disabled:opacity-60"
                  >
                    {lookingUp ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}

                    Pobierz dane
                  </button>
                </div>
              </label>

              {lookup && (
                <div className="sm:col-span-2 rounded-3xl border border-emerald-400/20 bg-emerald-400/[.055] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[.16em] text-emerald-300/70">
                        Znaleziono firmę
                      </div>

                      <div className="mt-2 font-semibold text-emerald-100">
                        {lookup.company_name}
                      </div>

                      <div className="mt-2 text-sm leading-6 text-white/50">
                        {lookup.address || "Brak adresu w rejestrze"}
                      </div>

                      <div className="mt-3 text-xs text-white/35">
                        NIP {lookup.nip}
                        {lookup.regon
                          ? ` · REGON ${lookup.regon}`
                          : ""}
                        {lookup.krs
                          ? ` · KRS ${lookup.krs}`
                          : ""}
                      </div>

                      <div className="mt-1 text-xs text-white/35">
                        Status VAT: {lookup.vat_status || "brak danych"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={applyLookup}
                      className="primary-button shrink-0"
                    >
                      Zastosuj dane
                    </button>
                  </div>

                  <div className="mt-4 border-t border-white/[.07] pt-3 text-[11px] text-white/28">
                    {lookup.source} · stan na {lookup.lookup_date}
                  </div>
                </div>
              )}

              <label className="field">
                <span>REGON</span>

                <input
                  value={form.regon}
                  onChange={(event) =>
                    update(
                      "regon",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="field">
                <span>KRS</span>

                <input
                  value={form.krs}
                  onChange={(event) =>
                    update(
                      "krs",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="field sm:col-span-2">
                <span>Status VAT</span>

                <input
                  value={form.vat_status}
                  onChange={(event) =>
                    update(
                      "vat_status",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Imię</span>

                <input
                  value={form.first_name}
                  onChange={(event) =>
                    update(
                      "first_name",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="field">
                <span>Nazwisko</span>

                <input
                  value={form.last_name}
                  onChange={(event) =>
                    update(
                      "last_name",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="field">
              <span>E-mail</span>

              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  update(
                    "email",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field">
              <span>Telefon</span>

              <input
                value={form.phone}
                onChange={(event) =>
                  update(
                    "phone",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field sm:col-span-2">
              <span>Adres</span>

              <input
                value={form.address}
                onChange={(event) =>
                  update(
                    "address",
                    event.target.value
                  )
                }
                placeholder="Ulica, numer lokalu"
              />
            </label>

            <label className="field">
              <span>Kod pocztowy</span>

              <input
                value={form.postal_code}
                onChange={(event) =>
                  update(
                    "postal_code",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field">
              <span>Miasto</span>

              <input
                value={form.city}
                onChange={(event) =>
                  update(
                    "city",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="field sm:col-span-2">
              <span>Kraj</span>

              <input
                value={form.country}
                onChange={(event) =>
                  update(
                    "country",
                    event.target.value
                  )
                }
              />
            </label>

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
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {client && (
              <button
                type="button"
                onClick={() =>
                  void createOrder()
                }
                disabled={
                  creatingOrder
                  || client.is_archived
                }
                className="secondary-button mr-auto border-emerald-400/20 text-emerald-200 disabled:opacity-40"
              >
                <ShoppingBag className="size-4" />

                {creatingOrder
                  ? "Tworzenie..."
                  : "Nowe zamówienie"}
              </button>
            )}

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
              <PackageCheck className="size-4" />

              {saving
                ? "Zapisywanie..."
                : "Zapisz klienta"}
            </button>
          </div>
        </form>

        {client && (
          <>
            <section className="mt-8 border-t border-white/[.07] pt-7">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    Historia zamówień
                  </h3>

                  <div className="mt-1 text-xs text-white/35">
                    {orders.length} zamówień · {money(client.order_value)}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {orders.length === 0 ? (
                  <div className="rounded-2xl border border-white/[.06] bg-white/[.02] px-4 py-5 text-sm text-white/35">
                    Brak zamówień tego klienta.
                  </div>
                ) : (
                  orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() =>
                        router.push(
                          `/orders/${order.id}`
                        )
                      }
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/[.06] bg-white/[.02] px-4 py-3 text-left transition hover:border-violet-400/25"
                    >
                      <div>
                        <div className="text-sm font-medium">
                          {order.order_number} · {order.name}
                        </div>

                        <div className="mt-1 text-xs text-white/30">
                          {date(order.created_at)} · {order.status}
                        </div>
                      </div>

                      <div className="text-sm font-semibold">
                        {money(Number(order.price))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <button
              type="button"
              onClick={() =>
                void toggleArchive()
              }
              disabled={saving}
              className="secondary-button mt-6 w-full justify-center text-red-200 disabled:opacity-60"
            >
              {client.is_archived ? (
                <RefreshCw className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}

              {client.is_archived
                ? "Przywróć klienta"
                : "Archiwizuj klienta"}
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();

  const [token, setToken] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [clients, setClients] =
    useState<Client[]>([]);

  const [stats, setStats] =
    useState<ClientStats | null>(null);

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

  const [selected, setSelected] =
    useState<Client | null>(null);

  const [toast, setToast] =
    useState("");

  const showToast = (message: string) => {
    setToast(message);

    window.setTimeout(
      () => setToast(""),
      2800
    );
  };

  const logout = () => {
    localStorage.removeItem("yokai_token");
    localStorage.removeItem("yokai_email");
    router.replace("/");
  };

  const load = async () => {
    if (!token) return;

    setLoading(true);

    try {
      const [
        clientsResponse,
        statsResponse,
      ] = await Promise.all([
        fetch(
          `/api/clients?archived=${showArchived}&limit=500`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        ),
        fetch(
          "/api/clients/stats",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        ),
      ]);

      if (
        clientsResponse.status === 401
        || statsResponse.status === 401
      ) {
        logout();
        return;
      }

      if (
        !clientsResponse.ok
        || !statsResponse.ok
      ) {
        throw new Error(
          "Nie udało się pobrać klientów"
        );
      }

      setClients(
        await clientsResponse.json()
      );

      setStats(
        await statsResponse.json()
      );
    } catch (loadError) {
      showToast(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać klientów"
      );
    } finally {
      setLoading(false);
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

    const params =
      new URLSearchParams(
        window.location.search
      );

    if (params.get("new") === "1") {
      setSelected(null);
      setModalOpen(true);

      window.history.replaceState(
        {},
        "",
        "/clients"
      );
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [token, showArchived]);

  const visibleClients = useMemo(() => {
    const phrase =
      search.trim().toLocaleLowerCase("pl");

    if (!phrase) return clients;

    return clients.filter((client) =>
      [
        client.client_number,
        client.display_name,
        client.nip || "",
        client.regon || "",
        client.email || "",
        client.phone || "",
        client.address || "",
        client.city || "",
      ]
        .join(" ")
        .toLocaleLowerCase("pl")
        .includes(phrase)
    );
  }, [clients, search]);

  const cards: Array<{
    label: string;
    value: string | number;
    icon: IconComponent;
    tone: string;
  }> = [
    {
      label: "Aktywni klienci",
      value: stats?.active ?? 0,
      icon: Users,
      tone: "text-violet-300",
    },
    {
      label: "Firmy",
      value: stats?.companies ?? 0,
      icon: Building2,
      tone: "text-cyan-300",
    },
    {
      label: "Osoby",
      value: stats?.people ?? 0,
      icon: UserRound,
      tone: "text-amber-300",
    },
    {
      label: "Wartość powiązanych zamówień",
      value: money(
        stats?.linked_value ?? 0
      ),
      icon: CircleDollarSign,
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
          onClick={() => {
            setSelected(null);
            setModalOpen(true);
          }}
          className="primary-button mt-8 w-full justify-center"
        >
          <Plus className="size-4" />
          Dodaj klienta
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
                {label}
              </button>
            )
          )}
        </nav>
      <SidebarAttentionBadge />

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
            aria-label="Zamknij"
          />

          <div className="relative h-full w-[86%] max-w-[320px] bg-[#0b0e14] p-5">
            <div className="mb-8 flex justify-between">
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
            Baza klientów YOKAI WRAP
          </div>

          <button className="icon-button">
            <Bell className="size-5" />
          </button>
        </header>

        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 xl:px-8 xl:py-9">
          <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/65">
                Relacje i historia
              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Klienci
              </h1>

              <p className="mt-2 text-sm text-white/38">
                Dane kontaktowe, firmy, NIP i historia zamówień.
              </p>
            </div>

            <button
              onClick={() => {
                setSelected(null);
                setModalOpen(true);
              }}
              className="primary-button self-start md:self-auto"
            >
              <Plus className="size-4" />
              Dodaj klienta
            </button>
          </section>

          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(
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
                  className="h-11 w-full rounded-2xl border border-white/[.07] bg-white/[.025] pl-11 pr-4 text-sm outline-none focus:border-violet-400/45"
                  placeholder="Szukaj nazwy, NIP-u, telefonu, e-maila lub miasta..."
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

            {loading ? (
              <div className="grid min-h-[420px] place-items-center">
                <LoaderCircle className="size-7 animate-spin text-white/25" />
              </div>
            ) : visibleClients.length === 0 ? (
              <div className="grid min-h-[420px] place-items-center text-center">
                <div>
                  <Users className="mx-auto size-11 text-white/15" />

                  <div className="mt-4 font-medium">
                    Brak klientów
                  </div>

                  <div className="mt-2 text-sm text-white/35">
                    Dodaj pierwszego klienta lub firmę.
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[.055]">
                {visibleClients.map(
                  (client) => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setSelected(client);
                        setModalOpen(true);
                      }}
                      className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-white/[.025] md:grid-cols-[minmax(240px,1.5fr)_minmax(180px,1fr)_minmax(130px,.7fr)_auto] md:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/[.07] bg-white/[.03]">
                          {client.client_type === "company" ? (
                            <Building2 className="size-5 text-cyan-300" />
                          ) : (
                            <UserRound className="size-5 text-violet-300" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate font-semibold text-white/90">
                            {client.display_name}
                          </div>

                          <div className="mt-1 text-xs text-white/30">
                            {client.client_number}
                            {client.nip
                              ? ` · NIP ${client.nip}`
                              : ""}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-white/40">
                        {client.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="size-3.5" />
                            <span className="truncate">
                              {client.email}
                            </span>
                          </div>
                        )}

                        {client.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="size-3.5" />
                            <span>
                              {client.phone}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-semibold">
                          {client.order_count} zam.
                        </div>

                        <div className="mt-1 text-xs text-white/30">
                          {money(client.order_value)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-violet-200">
                        <PencilLine className="size-4" />
                        Otwórz
                      </div>
                    </button>
                  )
                )}
              </div>
            )}

            <div className="border-t border-white/[.05] px-5 py-4 text-xs text-white/30">
              {visibleClients.length} klientów
            </div>
          </section>
        </div>
      </div>

      {modalOpen && (
        <ClientModal
          key={
            selected
              ? selected.id
              : "new"
          }
          token={token}
          client={selected}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
          }}
          onSaved={(message) => {
            setModalOpen(false);
            setSelected(null);
            showToast(message);
            void load();
          }}
          onChanged={(message) => {
            setModalOpen(false);
            setSelected(null);
            showToast(message);
            void load();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[90] flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl">
          <PackageCheck className="size-5 text-emerald-400" />
          {toast}
        </div>
      )}
          <BulkOperationsButton entity="clients" />
</main>
  );
}
