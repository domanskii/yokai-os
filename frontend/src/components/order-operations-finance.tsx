"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  LoaderCircle,
  Ruler,
  Save,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";

type Snapshot = {
  order_id: number;
  order_number: string;
  client_name: string;
  order_name: string;
  status: string;
  deadline: string | null;
  priority:
    | "low"
    | "normal"
    | "high"
    | "urgent";
  production_bucket:
    | "today"
    | "tomorrow"
    | "later";
  is_overdue: boolean;
  price: number;
  paid_amount: number;
  material_cost: number;
  labor_cost: number;
  total_estimated_cost: number;
  estimated_profit: number;
  margin_percent: number;
  material_cost_source:
    | "actual_usage"
    | "calculation"
    | "none";
  material_usage_count: number;
  used_length_m: number;
  calculation_number:
    | string
    | null;
};

type Material = {
  id: number;
  name: string;
  color_name?: string | null;
  color_code?: string | null;
  width_cm?: number;
  roll_length_m?: number;
  purchase_price?: number;
  stock_length_m?: number;
};

type Usage = {
  id: number;
  material_id:
    | number
    | null;
  material_name: string;
  material_color_name:
    | string
    | null;
  material_color_code:
    | string
    | null;
  used_length_m: number;
  cost_per_linear_m: number;
  cost_snapshot: number;
  stock_deducted: boolean;
  stock_deducted_length_m: number;
  calculator_covered_length_m: number;
  current_stock_length_m:
    | number
    | null;
  notes:
    | string
    | null;
  created_at: string;
  stock_note?: string;
};

async function readError(
  response: Response,
  fallback: string
) {
  const type =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    type.includes(
      "application/json"
    )
  ) {
    const data =
      await response.json();

    if (
      typeof data.detail
      === "string"
    ) {
      return data.detail;
    }
  } else {
    await response.text();
  }

  return fallback;
}

function money(
  value: number
) {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      style: "currency",
      currency: "PLN",
    }
  ).format(
    value || 0
  );
}

function number(
  value: number,
  digits = 2
) {
  return new Intl.NumberFormat(
    "pl-PL",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits:
        digits,
    }
  ).format(
    value || 0
  );
}

const PRIORITY_LABELS = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
  urgent: "Pilny",
};

const BUCKET_LABELS = {
  today: "Dzisiaj",
  tomorrow: "Jutro",
  later: "Później",
};

export function OrderOperationsFinance({
  orderId,
}: {
  orderId: number;
}) {
  const [
    snapshot,
    setSnapshot,
  ] = useState<Snapshot | null>(
    null
  );

  const [
    materials,
    setMaterials,
  ] = useState<Material[]>([]);

  const [
    usages,
    setUsages,
  ] = useState<Usage[]>([]);

  const [
    deadline,
    setDeadline,
  ] = useState("");

  const [
    priority,
    setPriority,
  ] = useState<
    Snapshot["priority"]
  >("normal");

  const [
    bucket,
    setBucket,
  ] = useState<
    Snapshot["production_bucket"]
  >("later");

  const [
    materialSearch,
    setMaterialSearch,
  ] = useState("");

  const [
    materialId,
    setMaterialId,
  ] = useState("");

  const [
    usedLength,
    setUsedLength,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingPlanning,
    setSavingPlanning,
  ] = useState(false);

  const [
    addingUsage,
    setAddingUsage,
  ] = useState(false);

  const [
    busyUsageId,
    setBusyUsageId,
  ] = useState<
    number | null
  >(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const authHeaders = () => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    return {
      Authorization:
        `Bearer ${token || ""}`,
    };
  };

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const headers =
        authHeaders();

      const [
        snapshotResponse,
        materialResponse,
        usageResponse,
      ] = await Promise.all([
        fetch(
          `/api/orders/${orderId}/operations-finance`,
          {
            headers,
            cache: "no-store",
          }
        ),
        fetch(
          "/api/materials?archived=false&limit=1000",
          {
            headers,
            cache: "no-store",
          }
        ),
        fetch(
          `/api/orders/${orderId}/material-usage`,
          {
            headers,
            cache: "no-store",
          }
        ),
      ]);

      if (
        !snapshotResponse.ok
      ) {
        throw new Error(
          await readError(
            snapshotResponse,
            "Nie udało się pobrać danych zamówienia"
          )
        );
      }

      if (
        !materialResponse.ok
      ) {
        throw new Error(
          await readError(
            materialResponse,
            "Nie udało się pobrać materiałów"
          )
        );
      }

      if (
        !usageResponse.ok
      ) {
        throw new Error(
          await readError(
            usageResponse,
            "Nie udało się pobrać zużycia materiałów"
          )
        );
      }

      const nextSnapshot:
        Snapshot =
        await snapshotResponse.json();

      const nextMaterials =
        await materialResponse.json();

      const nextUsages:
        Usage[] =
        await usageResponse.json();

      setSnapshot(
        nextSnapshot
      );

      setDeadline(
        nextSnapshot.deadline
          ? String(
              nextSnapshot.deadline
            ).slice(0, 10)
          : ""
      );

      setPriority(
        nextSnapshot.priority
      );

      setBucket(
        nextSnapshot.production_bucket
      );

      setMaterials(
        Array.isArray(
          nextMaterials
        )
          ? nextMaterials
          : []
      );

      setUsages(
        nextUsages
      );
    } catch (
      loadError
    ) {
      setError(
        loadError
          instanceof Error
          ? loadError.message
          : "Nie udało się pobrać danych"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  const filteredMaterials =
    useMemo(() => {
      const phrase =
        materialSearch
          .trim()
          .toLocaleLowerCase(
            "pl"
          );

      if (!phrase) {
        return materials;
      }

      return materials.filter(
        (material) =>
          [
            material.name,
            material.color_name
              || "",
            material.color_code
              || "",
          ]
            .join(" ")
            .toLocaleLowerCase(
              "pl"
            )
            .includes(
              phrase
            )
      );
    }, [
      materials,
      materialSearch,
    ]);

  const selectedMaterial =
    materials.find(
      (material) =>
        String(
          material.id
        ) === materialId
    );

  const savePlanning =
    async () => {
      setSavingPlanning(
        true
      );
      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/planning`,
            {
              method: "PATCH",
              headers: {
                ...authHeaders(),
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  {
                    deadline:
                      deadline
                        || null,
                    priority,
                    production_bucket:
                      bucket,
                  }
                ),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się zapisać planu"
            )
          );
        }

        const next:
          Snapshot =
          await response.json();

        setSnapshot(next);

        setMessage(
          "Plan produkcji zapisany"
        );

        window.setTimeout(
          () =>
            setMessage(
              ""
            ),
          2200
        );
      } catch (
        saveError
      ) {
        setError(
          saveError
            instanceof Error
            ? saveError.message
            : "Nie udało się zapisać"
        );
      } finally {
        setSavingPlanning(
          false
        );
      }
    };

  const addUsage =
    async (
      event:
        React.FormEvent
    ) => {
      event.preventDefault();

      if (
        !materialId
      ) {
        setError(
          "Wybierz materiał"
        );
        return;
      }

      const parsedLength =
        Number(
          usedLength.replace(
            ",",
            "."
          )
        );

      if (
        !Number.isFinite(
          parsedLength
        )
        || parsedLength <= 0
      ) {
        setError(
          "Podaj prawidłowe zużycie w metrach"
        );
        return;
      }

      setAddingUsage(
        true
      );

      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/material-usage`,
            {
              method: "POST",
              headers: {
                ...authHeaders(),
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  {
                    material_id:
                      Number(
                        materialId
                      ),
                    used_length_m:
                      parsedLength,
                    notes:
                      notes.trim()
                        || null,
                  }
                ),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się dodać zużycia"
            )
          );
        }

        const created:
          Usage =
          await response.json();

        setUsedLength("");
        setNotes("");

        setMessage(
          created.stock_note
            || "Dodano zużycie materiału"
        );

        await load();

        window.setTimeout(
          () =>
            setMessage(
              ""
            ),
          3500
        );
      } catch (
        addError
      ) {
        setError(
          addError
            instanceof Error
            ? addError.message
            : "Nie udało się dodać zużycia"
        );
      } finally {
        setAddingUsage(
          false
        );
      }
    };

  const removeUsage =
    async (
      usage: Usage
    ) => {
      const confirmed =
        window.confirm(
          `Usunąć zużycie ${number(usage.used_length_m, 3)} m materiału "${usage.material_name}"?\n\nJeżeli ta pozycja odjęła stan magazynowy, zostanie on automatycznie przywrócony.`
        );

      if (!confirmed) {
        return;
      }

      setBusyUsageId(
        usage.id
      );

      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            `/api/order-material-usage/${usage.id}`,
            {
              method:
                "DELETE",
              headers:
                authHeaders(),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się usunąć zużycia"
            )
          );
        }

        const result =
          await response.json();

        setMessage(
          result.restored_stock_m
            > 0
            ? (
              `Usunięto wpis i przywrócono ${number(result.restored_stock_m, 3)} m na magazyn.`
            )
            : "Usunięto wpis zużycia."
        );

        await load();

        window.setTimeout(
          () =>
            setMessage(
              ""
            ),
          3000
        );
      } catch (
        removeError
      ) {
        setError(
          removeError
            instanceof Error
            ? removeError.message
            : "Nie udało się usunąć zużycia"
        );
      } finally {
        setBusyUsageId(
          null
        );
      }
    };

  if (loading) {
    return (
      <section className="surface-card mt-5 grid min-h-[220px] place-items-center">
        <LoaderCircle className="size-6 animate-spin text-white/25" />
      </section>
    );
  }

  return (
    <section className="surface-card mt-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <TrendingUp className="size-5 text-violet-300" />
            Operacje i rentowność
          </div>

          <div className="mt-1 text-xs text-white/35">
            Termin, priorytet, plan produkcji, rzeczywiste zużycie materiału i marża zamówienia.
          </div>
        </div>

        {snapshot?.is_overdue && (
          <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/[.07] px-3 py-2 text-xs font-semibold text-red-200">
            <AlertTriangle className="size-4" />
            Zamówienie opóźnione
          </div>
        )}
      </div>

      <div className="grid gap-4 border-b border-white/[.06] p-5 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="field">
          <span>
            Termin realizacji
          </span>

          <input
            type="date"
            value={deadline}
            onChange={(
              event
            ) =>
              setDeadline(
                event.target.value
              )
            }
          />
        </label>

        <label className="field">
          <span>
            Priorytet
          </span>

          <select
            value={priority}
            onChange={(
              event
            ) =>
              setPriority(
                event.target
                  .value as Snapshot["priority"]
              )
            }
          >
            {Object.entries(
              PRIORITY_LABELS
            ).map(
              ([
                value,
                label,
              ]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <label className="field">
          <span>
            Plan produkcji
          </span>

          <select
            value={bucket}
            onChange={(
              event
            ) =>
              setBucket(
                event.target
                  .value as Snapshot["production_bucket"]
              )
            }
          >
            {Object.entries(
              BUCKET_LABELS
            ).map(
              ([
                value,
                label,
              ]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>
        </label>

        <button
          onClick={() =>
            void savePlanning()
          }
          disabled={
            savingPlanning
          }
          className="primary-button self-end justify-center disabled:opacity-60"
        >
          {savingPlanning ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}

          Zapisz
        </button>
      </div>

      {snapshot && (
        <div className="grid gap-3 border-b border-white/[.06] p-5 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
            <Wallet className="size-4 text-emerald-300" />

            <div className="mt-3 text-xl font-semibold">
              {money(
                snapshot.price
              )}
            </div>

            <div className="mt-1 text-xs text-white/30">
              Wartość zamówienia
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
            <Boxes className="size-4 text-cyan-300" />

            <div className="mt-3 text-xl font-semibold">
              {money(
                snapshot.material_cost
              )}
            </div>

            <div className="mt-1 text-xs text-white/30">
              Koszt materiałów
            </div>
          </div>

          <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
            <CalendarDays className="size-4 text-amber-300" />

            <div className="mt-3 text-xl font-semibold">
              {money(
                snapshot.labor_cost
              )}
            </div>

            <div className="mt-1 text-xs text-white/30">
              Koszt pracy z kalkulatora
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.035] p-4">
            <TrendingUp className="size-4 text-emerald-300" />

            <div className={`mt-3 text-xl font-semibold ${
              snapshot.estimated_profit
                >= 0
                ? "text-emerald-200"
                : "text-red-200"
            }`}>
              {money(
                snapshot.estimated_profit
              )}
            </div>

            <div className="mt-1 text-xs text-white/30">
              Szacowany zysk
            </div>
          </div>

          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[.035] p-4">
            <TrendingUp className="size-4 text-violet-300" />

            <div className="mt-3 text-xl font-semibold">
              {number(
                snapshot.margin_percent
              )}
              %
            </div>

            <div className="mt-1 text-xs text-white/30">
              Marża
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-white/[.06] p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Ruler className="size-4 text-violet-300" />
          Zużycie materiałów
        </div>

        <div className="mt-1 text-xs text-white/35">
          Wpisujesz rzeczywistą długość pobraną z rolki. System oblicza koszt i odejmuje stan magazynowy.
        </div>

        <form
          onSubmit={
            addUsage
          }
          className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.5fr_.55fr_1fr_auto]"
        >
          <label className="field">
            <span>
              Szukaj
            </span>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />

              <input
                value={
                  materialSearch
                }
                onChange={(
                  event
                ) =>
                  setMaterialSearch(
                    event.target.value
                  )
                }
                className="pl-10"
                placeholder="np. 551 biały"
              />
            </div>
          </label>

          <label className="field">
            <span>
              Materiał
            </span>

            <select
              value={
                materialId
              }
              onChange={(
                event
              ) =>
                setMaterialId(
                  event.target.value
                )
              }
            >
              <option value="">
                Wybierz materiał
              </option>

              {filteredMaterials.map(
                (material) => (
                  <option
                    key={
                      material.id
                    }
                    value={
                      material.id
                    }
                  >
                    {material.name}
                    {material.color_name
                      ? ` · ${material.color_name}`
                      : ""}
                    {material.stock_length_m
                      !== undefined
                      ? ` · ${number(Number(material.stock_length_m), 2)} m`
                      : ""}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="field">
            <span>
              Zużyto [m]
            </span>

            <input
              value={
                usedLength
              }
              onChange={(
                event
              ) =>
                setUsedLength(
                  event.target.value
                )
              }
              inputMode="decimal"
              placeholder="0,50"
            />
          </label>

          <label className="field">
            <span>
              Notatka
            </span>

            <input
              value={notes}
              onChange={(
                event
              ) =>
                setNotes(
                  event.target.value
                )
              }
              placeholder="opcjonalnie"
            />
          </label>

          <button
            disabled={
              addingUsage
              || !materialId
            }
            className="primary-button self-end justify-center disabled:opacity-50"
          >
            {addingUsage ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Ruler className="size-4" />
            )}

            Dodaj
          </button>
        </form>

        {selectedMaterial && (
          <div className="mt-3 text-xs text-white/30">
            Stan:{" "}
            <strong className="text-white/60">
              {number(
                Number(
                  selectedMaterial.stock_length_m
                  || 0
                ),
                3
              )}
              {" m"}
            </strong>
            {" · "}
            Cena rolki:{" "}
            <strong className="text-white/60">
              {money(
                Number(
                  selectedMaterial.purchase_price
                  || 0
                )
              )}
            </strong>
            {" · "}
            Długość rolki:{" "}
            <strong className="text-white/60">
              {number(
                Number(
                  selectedMaterial.roll_length_m
                  || 0
                ),
                2
              )}
              {" m"}
            </strong>
          </div>
        )}
      </div>

      {usages.length === 0 ? (
        <div className="grid min-h-[130px] place-items-center p-5 text-center">
          <div>
            <Boxes className="mx-auto size-8 text-white/15" />

            <div className="mt-3 text-sm font-medium">
              Brak rzeczywistego zużycia
            </div>

            <div className="mt-1 text-xs text-white/30">
              Dopóki nic nie dodasz, koszt materiałów może być pobierany z kalkulatora.
            </div>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-white/[.055]">
          {usages.map(
            (usage) => (
              <div
                key={
                  usage.id
                }
                className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white/90">
                    {usage.material_name}
                    {usage.material_color_name
                      ? ` · ${usage.material_color_name}`
                      : ""}
                  </div>

                  <div className="mt-1 text-xs text-white/32">
                    {number(
                      usage.used_length_m,
                      3
                    )}
                    {" m · "}
                    {money(
                      usage.cost_snapshot
                    )}
                    {" · "}
                    {usage.stock_deducted_length_m
                      > 0
                      ? (
                        `odjęto ${number(usage.stock_deducted_length_m, 3)} m z magazynu`
                      )
                      : (
                        "magazyn był już rozliczony przez kalkulator"
                      )}
                  </div>

                  {usage.notes && (
                    <div className="mt-1 text-xs text-white/25">
                      {usage.notes}
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    void removeUsage(
                      usage
                    )
                  }
                  disabled={
                    busyUsageId
                    === usage.id
                  }
                  className="secondary-button compact border-red-400/20 text-red-200 hover:bg-red-400/[.06] disabled:opacity-50"
                >
                  {busyUsageId
                    === usage.id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}

                  Usuń
                </button>
              </div>
            )
          )}
        </div>
      )}

      {error && (
        <div className="border-t border-red-400/15 bg-red-400/[.05] px-5 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {message && (
        <div className="border-t border-emerald-400/15 bg-emerald-400/[.05] px-5 py-3 text-sm text-emerald-200">
          {message}
        </div>
      )}
    </section>
  );
}
