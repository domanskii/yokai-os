"use client";

import Link from "next/link";
import {
  Bell,
  Boxes,
  Calculator,
  FileBarChart,
  HeartPulse,
  Layers3,
  Settings,
  Sparkles,
  Users,
  ChevronRight,
  CircleDollarSign,
  CloudOff,
  Download,
  Home,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Smartphone,
  Wifi,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type ProductionBoard = {
  orders?: {
    id: number;
    active_session?: unknown;
  }[];
};

type NotificationSummary = {
  count?: number;
  high?: number;
  medium?: number;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome:
      | "accepted"
      | "dismissed";
  }>;
};

async function api(
  path: string
) {
  const token =
    localStorage.getItem(
      "yokai_token"
    );

  const response = await fetch(
    `/api${path}`,
    {
      headers: {
        Authorization:
          `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: any;
}) {
  return (
    <div className="rounded-2xl border border-white/[.06] bg-[#0e131a] p-4">
      <div className="flex items-center gap-2 text-xs text-white/30">
        <Icon className="size-3.5" />
        {label}
      </div>

      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>
    </div>
  );
}

const quickLinks = [
  {
    href: "/",
    title: "Dashboard",
    description:
      "Główny pulpit YOKAI OS",
    icon: Home,
  },
  {
    href: "/orders",
    title: "Zamówienia",
    description:
      "Lista i szczegóły zamówień",
    icon: ShoppingBag,
  },
  {
    href: "/production",
    title: "Produkcja",
    description:
      "Kanban i statusy realizacji",
    icon: Layers3,
  },
  {
    href: "/production-pro",
    title: "Produkcja PRO",
    description:
      "Czas, zużycie materiałów i realny zysk",
    icon: Zap,
  },
  {
    href: "/notifications",
    title: "Powiadomienia",
    description:
      "Terminy, płatności, SVG i magazyn",
    icon: Bell,
  },
  {
    href: "/calculator",
    title: "Kalkulator",
    description:
      "Wycena naklejek i zapis kalkulacji",
    icon: Calculator,
  },
  {
    href: "/library",
    title: "Biblioteka SVG",
    description:
      "Pliki i projekty produkcyjne",
    icon: Boxes,
  },
  {
    href: "/ai-studio",
    title: "AI Studio",
    description:
      "Projekty AI i wersje koncepcji",
    icon: Sparkles,
  },
  {
    href: "/materials",
    title: "Materiały",
    description:
      "Stany magazynowe i historia zużycia",
    icon: PackageOpen,
  },
  {
    href: "/clients",
    title: "Klienci",
    description:
      "Baza klientów i historia zamówień",
    icon: Users,
  },
  {
    href: "/finance",
    title: "Finanse",
    description:
      "Koszty, sprzedaż i zysk",
    icon: CircleDollarSign,
  },
  {
    href: "/reports",
    title: "Raporty",
    description:
      "Obrót, marża, zysk i eksport CSV",
    icon: FileBarChart,
  },
  {
    href: "/settings",
    title: "Ustawienia",
    description:
      "Koszty pracy i parametry YOKAI OS",
    icon: Settings,
  },
  {
    href: "/system",
    title: "System i backup",
    description:
      "Stan usług i kopie bezpieczeństwa",
    icon: HeartPulse,
  },
];

export default function MobilePage() {
  const [loading, setLoading] =
    useState(true);

  const [production, setProduction] =
    useState<ProductionBoard | null>(
      null
    );

  const [notifications, setNotifications] =
    useState<NotificationSummary | null>(
      null
    );

  const [online, setOnline] =
    useState(true);

  const [
    deferredPrompt,
    setDeferredPrompt,
  ] =
    useState<InstallPromptEvent | null>(
      null
    );

  const [installed, setInstalled] =
    useState(false);

  const load = useCallback(
    async () => {
      setLoading(true);

      try {
        const [
          productionData,
          notificationData,
        ] = await Promise.allSettled([
          api(
            "/production-pro/board"
          ),
          api(
            "/notifications/summary"
          ),
        ]);

        if (
          productionData.status
          === "fulfilled"
        ) {
          setProduction(
            productionData.value
          );
        }

        if (
          notificationData.status
          === "fulfilled"
        ) {
          setNotifications(
            notificationData.value
          );
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setOnline(
      navigator.onLine
    );

    const handleOnline =
      () => setOnline(true);

    const handleOffline =
      () => setOnline(false);

    const handleInstallPrompt =
      (event: Event) => {
        event.preventDefault();

        setDeferredPrompt(
          event as InstallPromptEvent
        );
      };

    const handleInstalled =
      () => {
        setInstalled(true);
        setDeferredPrompt(null);
      };

    window.addEventListener(
      "online",
      handleOnline
    );

    window.addEventListener(
      "offline",
      handleOffline
    );

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt
    );

    window.addEventListener(
      "appinstalled",
      handleInstalled
    );

    const standalone =
      window.matchMedia(
        "(display-mode: standalone)"
      ).matches
      || (
        "standalone" in navigator
        && Boolean(
          (navigator as any)
            .standalone
        )
      );

    setInstalled(
      standalone
    );

    void load();

    return () => {
      window.removeEventListener(
        "online",
        handleOnline
      );

      window.removeEventListener(
        "offline",
        handleOffline
      );

      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt
      );

      window.removeEventListener(
        "appinstalled",
        handleInstalled
      );
    };
  }, [load]);

  const activeCount =
    useMemo(
      () =>
        production?.orders?.filter(
          (order) =>
            Boolean(
              order.active_session
            )
        ).length
        || 0,
      [production]
    );

  const queueCount =
    useMemo(
      () =>
        production?.orders?.filter(
          (order) =>
            !order.active_session
        ).length
        || 0,
      [production]
    );

  const install =
    async () => {
      if (!deferredPrompt) {
        return;
      }

      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;

      setDeferredPrompt(null);
    };

  const isIos =
    typeof navigator
    !== "undefined"
    && /iphone|ipad|ipod/i.test(
      navigator.userAgent
    );

  return (
    <main className="min-h-screen bg-[#080b10] pb-[calc(92px+env(safe-area-inset-bottom))] text-white lg:pl-[282px]">
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-[max(20px,env(safe-area-inset-top))]">
        <header className="rounded-3xl border border-white/[.06] bg-[#0e131a] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.22em] text-violet-300/65">
                YOKAI WRAP
              </div>

              <h1 className="mt-2 text-2xl font-semibold">
                YOKAI OS Mobile
              </h1>

              <div className="mt-2 flex items-center gap-2 text-xs text-white/30">
                {online ? (
                  <>
                    <Wifi className="size-3.5 text-emerald-300" />
                    Online
                  </>
                ) : (
                  <>
                    <CloudOff className="size-3.5 text-amber-300" />
                    Offline — zapis danych wyłączony
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() =>
                void load()
              }
              className="grid size-10 place-items-center rounded-xl border border-white/[.07] bg-white/[.02] text-white/40"
            >
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </button>
          </div>
        </header>

        {!installed && (
          <section className="mt-4 rounded-3xl border border-violet-400/15 bg-violet-500/[.05] p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10">
                <Smartphone className="size-5 text-violet-200" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  Zainstaluj YOKAI OS
                </div>

                <div className="mt-1 text-xs leading-5 text-white/35">
                  {deferredPrompt
                    ? "Dodaj system do ekranu głównego i uruchamiaj go jak aplikację."
                    : isIos
                      ? "Na iPhone: Safari → Udostępnij → Dodaj do ekranu początkowego."
                      : "Jeśli przeglądarka nie pokazuje przycisku, użyj jej menu i wybierz instalację aplikacji / dodanie do ekranu głównego."}
                </div>

                {deferredPrompt && (
                  <button
                    onClick={() =>
                      void install()
                    }
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold"
                  >
                    <Download className="size-4" />
                    Zainstaluj
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="mt-4 grid grid-cols-2 gap-3">
          <Metric
            label="W produkcji"
            value={activeCount}
            icon={Zap}
          />

          <Metric
            label="Kolejka"
            value={queueCount}
            icon={ShoppingBag}
          />

          <Metric
            label="Alerty"
            value={
              notifications
                ?.count
              || 0
            }
            icon={Bell}
          />

          <Metric
            label="Pilne"
            value={
              notifications
                ?.high
              || 0
            }
            icon={CloudOff}
          />
        </section>

        <section className="mt-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-white/30">
            Szybki dostęp
          </div>

          <div className="space-y-3">
            {quickLinks.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/[.06] bg-[#0e131a] p-4 active:scale-[.99]"
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[.035]">
                      <Icon className="size-5 text-violet-200/75" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {item.title}
                      </div>

                      <div className="mt-1 text-xs leading-5 text-white/28">
                        {item.description}
                      </div>
                    </div>

                    <ChevronRight className="size-4 shrink-0 text-white/20" />
                  </Link>
                );
              }
            )}
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[.07] bg-[#0a0e14]/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:left-[250px]">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {[
            {
              href:
                "/mobile",
              label:
                "Start",
              icon:
                Home,
            },
            {
              href:
                "/production-pro",
              label:
                "Produkcja",
              icon:
                Zap,
            },
            {
              href:
                "/orders",
              label:
                "Zamówienia",
              icon:
                ShoppingBag,
            },
            {
              href:
                "/calculator",
              label:
                "Kalkulator",
              icon:
                Calculator,
            },
            {
              href:
                "/notifications",
              label:
                "Alerty",
              icon:
                Bell,
            },
          ].map(
            (item) => {
              const Icon =
                item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-white/40"
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            }
          )}
        </div>
      </nav>
    </main>
  );
}
