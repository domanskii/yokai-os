"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  AlertTriangle,
  BadgeCheck,
  LoaderCircle,
  Nfc,
  Palette,
  Ruler,
  ShoppingBag,
  UserRound,
} from "lucide-react";

type Spec = {
  product_name: string;
  platform:
    | string
    | null;
  size:
    | string
    | null;
  background:
    | string
    | null;
  nfc:
    | string
    | null;
  nfc_enabled: boolean;
  profile_name:
    | string
    | null;
  nfc_url:
    | string
    | null;
  colors: {
    layer: string;
    value: any;
  }[];
  warnings: string[];
};

type Data = {
  available: boolean;
  woo_order_id:
    | number
    | null;
  woo_order_number:
    | string
    | null;
  spec: Spec;
};

export function ShopProductionSpec({
  orderId,
}: {
  orderId: number;
}) {
  const [data, setData] =
    useState<Data | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/shop-production-spec`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
              cache:
                "no-store",
            }
          );

        if (response.ok) {
          setData(
            await response.json()
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [
    orderId,
  ]);

  if (loading) {
    return (
      <section className="surface-card mt-5 grid min-h-[120px] place-items-center">
        <LoaderCircle className="size-5 animate-spin text-white/20" />
      </section>
    );
  }

  if (
    !data
    || !data.available
  ) {
    return null;
  }

  const spec =
    data.spec;

  return (
    <section className="surface-card mt-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[.06] p-5 font-semibold">
        <ShoppingBag className="size-5 text-cyan-300" />
        Specyfikacja produkcyjna ze sklepu
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <BadgeCheck className="size-4 text-violet-300" />
          <div className="mt-3 text-xs text-white/30">
            Platforma
          </div>
          <div className="mt-1 font-semibold text-white/75">
            {String(
              spec.platform
              || "nierozpoznana"
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <Ruler className="size-4 text-cyan-300" />
          <div className="mt-3 text-xs text-white/30">
            Rozmiar
          </div>
          <div className="mt-1 font-semibold text-white/75">
            {String(
              spec.size
              || "nierozpoznany"
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <Nfc className="size-4 text-emerald-300" />
          <div className="mt-3 text-xs text-white/30">
            NFC
          </div>
          <div className="mt-1 font-semibold text-white/75">
            {spec.nfc_enabled
              ? "TAK"
              : "NIE"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <UserRound className="size-4 text-amber-300" />
          <div className="mt-3 text-xs text-white/30">
            Profil / nazwa
          </div>
          <div className="mt-1 break-all font-semibold text-white/75">
            {String(
              spec.profile_name
              || "—"
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-white/[.06] p-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="size-4 text-violet-300" />
            Warstwy / kolory
          </div>

          <div className="mt-3 space-y-2">
            {spec.colors.length ? (
              spec.colors.map(
                (
                  color
                ) => (
                  <div
                    key={color.layer}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[.05] px-3 py-2 text-xs"
                  >
                    <span className="text-white/35">
                      {color.layer}
                    </span>

                    <span className="font-semibold text-white/70">
                      {String(
                        color.value
                      )}
                    </span>
                  </div>
                )
              )
            ) : (
              <div className="text-xs text-white/25">
                Brak rozpoznanych warstw kolorystycznych.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="text-sm font-semibold">
            Dane produkcyjne
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-white/30">
                Produkt
              </span>
              <span className="text-right text-white/65">
                {spec.product_name || "—"}
              </span>
            </div>

            <div className="flex justify-between gap-3">
              <span className="text-white/30">
                Tło
              </span>
              <span className="text-right text-white/65">
                {String(
                  spec.background
                  || "—"
                )}
              </span>
            </div>

            <div className="flex justify-between gap-3">
              <span className="text-white/30">
                Link NFC
              </span>
              <span className="break-all text-right text-white/65">
                {String(
                  spec.nfc_url
                  || "—"
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {spec.warnings.length > 0 && (
        <div className="border-t border-amber-400/12 bg-amber-400/[.035] px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <AlertTriangle className="size-4" />
            Do sprawdzenia
          </div>

          <div className="mt-2 space-y-1">
            {spec.warnings.map(
              (
                warning
              ) => (
                <div
                  key={warning}
                  className="text-xs text-amber-100/55"
                >
                  • {warning}
                </div>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
