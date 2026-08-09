"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  History,
  LoaderCircle,
  PackagePlus,
  PencilLine,
  RefreshCw,
  Search,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";

type MaterialRow = {
  id: number;
  name: string;
  color_name: string | null;
  color_code: string | null;
  width_cm: number | null;
  roll_length_m: number | null;
  purchase_price: number | null;
  stock_length_m: number;
  threshold_m: number;
  used_30d: number;
  received_30d: number;
  avg_daily_usage_m: number;
  days_left: number | null;
  cost_per_m: number;
  stock_value: number;
  recommended_purchase_m: number;
  needs_purchase: boolean;
};

type Overview = {
  materials_count: number;
  stock_value: number;
  usage_30d_m: number;
  receipts_30d_m: number;
  purchase_count: number;
  purchase_list: MaterialRow[];
  materials: MaterialRow[];
};

type Movement = {
  id: number;
  movement_type: string;
  delta_m: number;
  stock_before_m: number;
  stock_after_m: number;
  note: string | null;
  created_at: string;
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

function money(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(value || 0);
}

function number(value: number, digits = 2) {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function movementLabel(value: string) {
  return (
    {
      opening_balance: "Stan początkowy",
      receipt: "Przyjęcie",
      correction: "Korekta",
      system_adjustment: "Zmiana systemowa",
    }[value] || value
  );
}

function StockModal({
  material,
  mode,
  onClose,
  onSaved,
}: {
  material: MaterialRow;
  mode: "receipt" | "correction";
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [value, setValue] = useState(
    mode === "correction" ? String(material.stock_length_m) : ""
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsed = Number(value.replace(",", "."));
    if (
      !Number.isFinite(parsed)
      || parsed < 0
      || (mode === "receipt" && parsed <= 0)
    ) {
      setError("Podaj prawidłową wartość w metrach");
      return;
    }

    const token = localStorage.getItem("yokai_token");
    if (!token) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        mode === "receipt"
          ? `/api/materials/${material.id}/stock-receipt`
          : `/api/materials/${material.id}/stock-correction`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            mode === "receipt"
              ? {
                  quantity_m: parsed,
                  note: note.trim() || null,
                }
              : {
                  target_stock_m: parsed,
                  note: note.trim() || null,
                }
          ),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się zmienić stanu magazynowego"
          )
        );
      }

      const updated = await response.json();

      onSaved(
        mode === "receipt"
          ? `Przyjęto ${number(parsed, 3)} m. Stan: ${number(
              Number(updated.stock_length_m || 0),
              3
            )} m.`
          : `Stan skorygowany do ${number(
              Number(updated.stock_length_m || 0),
              3
            )} m.`
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nie udało się zapisać"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button className="absolute inset-0" onClick={onClose} />

      <form
        onSubmit={submit}
        className="surface-card relative z-10 w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[.06] p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Magazyn PRO
            </div>
            <h3 className="mt-2 text-xl font-semibold">
              {mode === "receipt" ? "Przyjęcie materiału" : "Korekta stanu"}
            </h3>
            <div className="mt-1 text-xs text-white/30">
              {material.name}
              {material.color_name ? ` · ${material.color_name}` : ""}
            </div>
          </div>

          <button type="button" onClick={onClose} className="icon-button">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-3 text-sm text-white/45">
            Aktualny stan:{" "}
            <strong className="text-white/80">
              {number(material.stock_length_m, 3)} m
            </strong>
          </div>

          <label className="field">
            <span>{mode === "receipt" ? "Dodaj [m]" : "Nowy stan [m]"}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="decimal"
              placeholder={mode === "receipt" ? "np. 3" : "np. 8,5"}
            />
          </label>

          <label className="field">
            <span>Notatka</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="np. nowa rolka / inwentaryzacja"
            />
          </label>

          {error && (
            <div className="rounded-2xl border border-red-400/15 bg-red-400/[.05] px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[.06] p-5">
          <button type="button" onClick={onClose} className="secondary-button">
            Anuluj
          </button>
          <button disabled={saving} className="primary-button disabled:opacity-50">
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : mode === "receipt" ? (
              <PackagePlus className="size-4" />
            ) : (
              <PencilLine className="size-4" />
            )}
            Zapisz
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryModal({
  material,
  onClose,
}: {
  material: MaterialRow;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("yokai_token");
    if (!token) return;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/inventory/movements?material_id=${material.id}&limit=200`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            await readError(response, "Nie udało się pobrać historii")
          );
        }

        setMovements(await response.json());
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Nie udało się pobrać historii"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [material.id]);

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button className="absolute inset-0" onClick={onClose} />

      <section className="surface-card relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-white/[.06] p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Historia ruchów
            </div>
            <h3 className="mt-2 text-xl font-semibold">
              {material.name}
              {material.color_name ? ` · ${material.color_name}` : ""}
            </h3>
          </div>
          <button onClick={onClose} className="icon-button">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid min-h-72 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-white/20" />
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-red-200">{error}</div>
          ) : movements.length === 0 ? (
            <div className="grid min-h-72 place-items-center text-sm text-white/25">
              Brak ruchów
            </div>
          ) : (
            <div className="divide-y divide-white/[.05]">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="text-sm font-medium text-white/75">
                      {movementLabel(movement.movement_type)}
                    </div>
                    <div className="mt-1 text-xs text-white/28">
                      {number(movement.stock_before_m, 3)} m →{" "}
                      {number(movement.stock_after_m, 3)} m
                    </div>
                    {movement.note && (
                      <div className="mt-1 text-xs text-white/30">
                        {movement.note}
                      </div>
                    )}
                  </div>

                  <div className="sm:text-right">
                    <div
                      className={`text-sm font-semibold ${
                        movement.delta_m > 0
                          ? "text-emerald-200"
                          : movement.delta_m < 0
                            ? "text-red-200"
                            : "text-white/40"
                      }`}
                    >
                      {movement.delta_m > 0 ? "+" : ""}
                      {number(movement.delta_m, 3)} m
                    </div>
                    <div className="mt-1 text-[10px] text-white/20">
                      {formatDate(movement.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function InventoryPro() {
  const [data, setData] = useState<Overview | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<{
    material: MaterialRow;
    mode: "receipt" | "correction";
  } | null>(null);
  const [historyMaterial, setHistoryMaterial] =
    useState<MaterialRow | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem("yokai_token");
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/inventory/overview", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await readError(response, "Nie udało się pobrać Magazynu PRO")
        );
      }

      setData(await response.json());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać Magazynu PRO"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const phrase = search.trim().toLocaleLowerCase("pl");
    if (!phrase) return data.materials;

    return data.materials.filter((material) =>
      [
        material.name,
        material.color_name || "",
        material.color_code || "",
      ]
        .join(" ")
        .toLocaleLowerCase("pl")
        .includes(phrase)
    );
  }, [data, search]);

  const saved = (text: string) => {
    setAction(null);
    setMessage(text);
    void load();
    window.setTimeout(() => setMessage(""), 3000);
  };

  return (
    <>
      <section className="surface-card mt-5 overflow-hidden lg:ml-[250px] lg:mr-5">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Boxes className="size-5 text-violet-300" />
              Magazyn PRO
            </div>
            <div className="mt-1 text-xs text-white/35">
              Ruchy magazynowe, przyjęcia rolek, korekty, zużycie i prognoza zakupów.
            </div>
          </div>

          <button
            onClick={() => void load()}
            className="secondary-button self-start sm:self-auto"
          >
            <RefreshCw className="size-4" />
            Odśwież
          </button>
        </div>

        {loading ? (
          <div className="grid min-h-[260px] place-items-center">
            <LoaderCircle className="size-7 animate-spin text-white/20" />
          </div>
        ) : error ? (
          <div className="p-5 text-sm text-red-200">{error}</div>
        ) : data ? (
          <>
            <div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                <Wallet className="size-4 text-emerald-300" />
                <div className="mt-3 text-xl font-semibold">
                  {money(data.stock_value)}
                </div>
                <div className="mt-1 text-xs text-white/30">
                  wartość zapasu
                </div>
              </div>

              <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                <TrendingDown className="size-4 text-cyan-300" />
                <div className="mt-3 text-xl font-semibold">
                  {number(data.usage_30d_m, 2)} m
                </div>
                <div className="mt-1 text-xs text-white/30">
                  rozchód 30 dni
                </div>
              </div>

              <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                <PackagePlus className="size-4 text-violet-300" />
                <div className="mt-3 text-xl font-semibold">
                  {number(data.receipts_30d_m, 2)} m
                </div>
                <div className="mt-1 text-xs text-white/30">
                  przyjęto 30 dni
                </div>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  data.purchase_count > 0
                    ? "border-amber-400/15 bg-amber-400/[.035]"
                    : "border-white/[.06] bg-white/[.02]"
                }`}
              >
                <ClipboardList className="size-4 text-amber-300" />
                <div className="mt-3 text-xl font-semibold">
                  {data.purchase_count}
                </div>
                <div className="mt-1 text-xs text-white/30">
                  pozycje do zakupu
                </div>
              </div>
            </div>

            {data.purchase_list.length > 0 && (
              <div className="border-b border-white/[.06] p-5">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4 text-amber-300" />
                  Lista zakupowa
                </div>
                <div className="mt-1 text-xs text-white/30">
                  Próg minimalny + tempo zużycia z ostatnich 30 dni.
                </div>

                <div className="mt-4 grid gap-2">
                  {data.purchase_list.map((material) => (
                    <div
                      key={material.id}
                      className="grid gap-3 rounded-2xl border border-amber-400/10 bg-amber-400/[.025] px-4 py-3 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white/78">
                          {material.name}
                          {material.color_name ? ` · ${material.color_name}` : ""}
                        </div>
                        <div className="mt-1 text-[10px] text-white/25">
                          stan {number(material.stock_length_m, 2)} m · próg{" "}
                          {number(material.threshold_m, 2)} m
                          {material.days_left !== null
                            ? ` · ok. ${number(material.days_left, 0)} dni zapasu`
                            : ""}
                        </div>
                      </div>

                      <div className="text-xs text-white/35 sm:text-right">
                        zużycie 30d
                        <div className="mt-1 font-semibold text-white/65">
                          {number(material.used_30d, 2)} m
                        </div>
                      </div>

                      <div className="text-xs text-amber-100/55 sm:text-right">
                        sugerowany zakup
                        <div className="mt-1 font-semibold text-amber-200">
                          {number(material.recommended_purchase_m, 2)} m
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-5">
              <label className="relative block max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/25" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/[.08] bg-white/[.025] pl-11 pr-4 text-sm outline-none focus:border-violet-400/40"
                  placeholder="Szukaj materiału, koloru lub kodu..."
                />
              </label>
            </div>

            <div className="overflow-x-auto border-t border-white/[.055]">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-white/[.055] text-[10px] uppercase tracking-wide text-white/25">
                  <tr>
                    <th className="px-5 py-3 font-medium">Materiał</th>
                    <th className="px-5 py-3 font-medium">Stan</th>
                    <th className="px-5 py-3 font-medium">30 dni</th>
                    <th className="px-5 py-3 font-medium">Prognoza</th>
                    <th className="px-5 py-3 font-medium">Wartość</th>
                    <th className="px-5 py-3 font-medium">Akcje</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/[.045]">
                  {visible.map((material) => (
                    <tr key={material.id} className="hover:bg-white/[.015]">
                      <td className="px-5 py-4">
                        <div className="font-medium text-white/80">
                          {material.name}
                        </div>
                        <div className="mt-1 text-xs text-white/25">
                          {material.color_name || "bez koloru"}
                          {material.color_code ? ` · ${material.color_code}` : ""}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div
                          className={`font-semibold ${
                            material.stock_length_m <= material.threshold_m
                              ? "text-amber-200"
                              : "text-white/70"
                          }`}
                        >
                          {number(material.stock_length_m, 3)} m
                        </div>
                        <div className="mt-1 text-[10px] text-white/25">
                          próg {number(material.threshold_m, 2)} m
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-white/60">
                          -{number(material.used_30d, 2)} m
                        </div>
                        <div className="mt-1 text-[10px] text-white/25">
                          +{number(material.received_30d, 2)} m przyjęć
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-white/60">
                          {material.days_left === null
                            ? "brak danych"
                            : `${number(material.days_left, 0)} dni`}
                        </div>
                        <div className="mt-1 text-[10px] text-white/25">
                          {number(material.avg_daily_usage_m, 3)} m/dzień
                        </div>
                      </td>

                      <td className="px-5 py-4 text-white/60">
                        {money(material.stock_value)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              setAction({ material, mode: "receipt" })
                            }
                            className="secondary-button compact border-emerald-400/15 text-emerald-200"
                          >
                            <PackagePlus className="size-4" />
                            Przyjmij
                          </button>

                          <button
                            onClick={() =>
                              setAction({ material, mode: "correction" })
                            }
                            className="secondary-button compact"
                          >
                            <PencilLine className="size-4" />
                            Korekta
                          </button>

                          <button
                            onClick={() => setHistoryMaterial(material)}
                            className="secondary-button compact"
                          >
                            <History className="size-4" />
                            Historia
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {visible.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-12 text-center text-white/25"
                      >
                        Brak pasujących materiałów.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {message && (
          <div className="border-t border-emerald-400/15 bg-emerald-400/[.05] px-5 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}
      </section>

      {action && (
        <StockModal
          material={action.material}
          mode={action.mode}
          onClose={() => setAction(null)}
          onSaved={saved}
        />
      )}

      {historyMaterial && (
        <HistoryModal
          material={historyMaterial}
          onClose={() => setHistoryMaterial(null)}
        />
      )}
    </>
  );
}
