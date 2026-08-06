"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Calculator,
  CircleDollarSign,
  LoaderCircle,
  PencilLine,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  ShoppingBag,
  Trash2,
  TriangleAlert,
} from "lucide-react";

type Material = {
  id: number;
  name: string;
  color_name: string;
  color_code: string;
  width_cm: number;
  roll_length_m: number;
  purchase_price: number;
  stock_length_m: number;
  cost_per_m2: number;
};

type Order = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
};

type HistoryMaterial = {
  material_id: number;
  name: string;
  layers: number;
  used_area_m2: number;
  used_length_m: number;
  cost: number;
};

type HistoryItem = {
  id: number;
  calculation_number: string;
  order_id: number | null;
  order_number: string | null;
  name: string;
  width_cm: number;
  height_cm: number;
  quantity: number;
  waste_percent: number;
  labor_minutes: number;
  hourly_rate: number;
  margin_percent: number;
  total_cost: number;
  suggested_price: number;
  material_breakdown: HistoryMaterial[];
  stock_deducted: boolean;
  order_price_updated: boolean;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

type Line = {
  key: string;
  material_id: string;
  layers: string;
};

function parseNumber(value: string) {
  const number = Number(
    value.trim().replace(/\s/g, "").replace(",", ".")
  );
  return Number.isFinite(number) ? number : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function number(value: number, digits = 3) {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: digits,
  }).format(value || 0);
}

export default function CalculatorPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [message, setMessage] = useState("");

  const [orderId, setOrderId] = useState("");
  const [name, setName] = useState("Kalkulacja naklejki");
  const [width, setWidth] = useState("50");
  const [height, setHeight] = useState("10");
  const [quantity, setQuantity] = useState("1");
  const [waste, setWaste] = useState("15");
  const [laborMinutes, setLaborMinutes] = useState("30");
  const [hourlyRate, setHourlyRate] = useState("50");
  const [margin, setMargin] = useState("40");
  const [notes, setNotes] = useState("");
  const [deductStock, setDeductStock] = useState(false);
  const [updateOrderPrice, setUpdateOrderPrice] = useState(false);
  const [lines, setLines] = useState<Line[]>([
    {
      key: "line-1",
      material_id: "",
      layers: "1",
    },
  ]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const api = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("yokai_token");
      localStorage.removeItem("yokai_email");
      router.replace("/");
      throw new Error("Sesja wygasła");
    }

    return response;
  };

  const load = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const [materialsResponse, ordersResponse, historyResponse] =
        await Promise.all([
          api("/api/materials?archived=false"),
          api("/api/orders?archived=false&limit=500"),
          api(`/api/calculations/manage?deleted=${showDeleted}&limit=20`),
        ]);

      if (
        !materialsResponse.ok ||
        !ordersResponse.ok ||
        !historyResponse.ok
      ) {
        throw new Error("Nie udało się pobrać danych kalkulatora");
      }

      setMaterials(await materialsResponse.json());
      setOrders(await ordersResponse.json());
      setHistory(await historyResponse.json());
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Nie udało się pobrać danych"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("yokai_token");

    if (!storedToken) {
      router.replace("/");
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    void load();
  }, [token, showDeleted]);

  useEffect(() => {
    const order = orders.find((item) => String(item.id) === orderId);
    if (order && editingId === null) {
      setName(`${order.order_number} · ${order.name}`);
    }
  }, [orderId, orders, editingId]);

  const result = useMemo(() => {
    const baseArea =
      parseNumber(width) /
      100 *
      (parseNumber(height) / 100) *
      Math.max(0, parseNumber(quantity));

    const wasteFactor = 1 + Math.max(0, parseNumber(waste)) / 100;
    let materialCost = 0;

    const breakdown = lines.map((line) => {
      const material = materials.find(
        (item) => String(item.id) === line.material_id
      );
      const layers = Math.max(0, parseNumber(line.layers));

      if (!material) {
        return {
          key: line.key,
          material: null,
          area: 0,
          length: 0,
          cost: 0,
          insufficient: false,
        };
      }

      const area = baseArea * layers * wasteFactor;
      const length = area / (material.width_cm / 100);
      const cost = area * material.cost_per_m2;
      materialCost += cost;

      return {
        key: line.key,
        material,
        area,
        length,
        cost,
        insufficient: length > material.stock_length_m,
      };
    });

    const laborCost =
      Math.max(0, parseNumber(laborMinutes)) /
      60 *
      Math.max(0, parseNumber(hourlyRate));

    const totalCost = materialCost + laborCost;
    const marginValue = Math.min(
      99.99,
      Math.max(0, parseNumber(margin))
    );
    const suggestedPrice =
      totalCost / (1 - marginValue / 100);

    return {
      baseArea,
      breakdown,
      materialCost,
      laborCost,
      totalCost,
      suggestedPrice,
      profit: suggestedPrice - totalCost,
      insufficient: breakdown.some((item) => item.insufficient),
    };
  }, [
    width,
    height,
    quantity,
    waste,
    laborMinutes,
    hourlyRate,
    margin,
    lines,
    materials,
  ]);

  const addLine = () => {
    setLines((current) => [
      ...current,
      {
        key: `${Date.now()}-${Math.random()}`,
        material_id: "",
        layers: "1",
      },
    ]);
  };

  const updateLine = (
    key: string,
    field: "material_id" | "layers",
    value: string
  ) => {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, [field]: value } : line
      )
    );
  };

  const removeLine = (key: string) => {
    setLines((current) =>
      current.length === 1
        ? current
        : current.filter((line) => line.key !== key)
    );
  };

  const resetEditor = () => {
    setEditingId(null);
    setOrderId("");
    setName("Kalkulacja naklejki");
    setWidth("50");
    setHeight("10");
    setQuantity("1");
    setWaste("15");
    setLaborMinutes("30");
    setHourlyRate("50");
    setMargin("40");
    setNotes("");
    setDeductStock(false);
    setUpdateOrderPrice(false);
    setLines([
      {
        key: `line-${Date.now()}`,
        material_id: "",
        layers: "1",
      },
    ]);
  };

  const editCalculation = (item: HistoryItem) => {
    setEditingId(item.id);
    setOrderId(item.order_id ? String(item.order_id) : "");
    setName(item.name);
    setWidth(String(item.width_cm));
    setHeight(String(item.height_cm));
    setQuantity(String(item.quantity));
    setWaste(String(item.waste_percent));
    setLaborMinutes(String(item.labor_minutes));
    setHourlyRate(String(item.hourly_rate));
    setMargin(String(item.margin_percent));
    setNotes(item.notes || "");
    setDeductStock(item.stock_deducted);
    setUpdateOrderPrice(item.order_price_updated);
    setLines(
      item.material_breakdown.length > 0
        ? item.material_breakdown.map((line, index) => ({
            key: `edit-${item.id}-${index}`,
            material_id: String(line.material_id),
            layers: String(line.layers),
          }))
        : [
            {
              key: `edit-${item.id}-0`,
              material_id: "",
              layers: "1",
            },
          ]
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
    notify(`Edycja ${item.calculation_number}`);
  };

  const changeDeletedState = async (item: HistoryItem) => {
    const action = item.is_deleted ? "restore" : "delete";

    if (
      !item.is_deleted &&
      !window.confirm(
        `Usunąć ${item.calculation_number}? Będzie można ją przywrócić.`
      )
    ) {
      return;
    }

    try {
      const response = await api(
        `/api/calculations/${item.id}/${action}`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Operacja nie powiodła się"
        );
      }

      if (editingId === item.id) {
        resetEditor();
      }

      notify(
        item.is_deleted
          ? `Przywrócono ${item.calculation_number}`
          : `Usunięto ${item.calculation_number}`
      );
      await load();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Operacja nie powiodła się"
      );
    }
  };

  const save = async () => {
    const validLines = lines.filter(
      (line) => line.material_id && parseNumber(line.layers) > 0
    );

    if (validLines.length === 0) {
      notify("Dodaj przynajmniej jeden materiał");
      return;
    }

    if (deductStock && result.insufficient) {
      notify("Za mało materiału na stanie");
      return;
    }

    setSaving(true);

    try {
      const response = await api(
        editingId
          ? `/api/calculations/${editingId}`
          : "/api/calculations",
        {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: orderId ? Number(orderId) : null,
          name: name.trim() || "Kalkulacja naklejki",
          width_cm: parseNumber(width),
          height_cm: parseNumber(height),
          quantity: Math.max(1, Math.round(parseNumber(quantity))),
          waste_percent: parseNumber(waste),
          labor_minutes: parseNumber(laborMinutes),
          hourly_rate: parseNumber(hourlyRate),
          margin_percent: parseNumber(margin),
          materials: validLines.map((line) => ({
            material_id: Number(line.material_id),
            layers: parseNumber(line.layers),
          })),
          deduct_stock: deductStock,
          update_order_price: Boolean(orderId) && updateOrderPrice,
          notes: notes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Nie udało się zapisać kalkulacji"
        );
      }

      notify(
        editingId
          ? `Zaktualizowano ${data.calculation_number}`
          : `Zapisano ${data.calculation_number}`
      );
      resetEditor();
      await load();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać kalkulacji"
      );
    } finally {
      setSaving(false);
    }
  };


  const createOrderFromCalculator = async () => {
    if (orderId) {
      router.push(`/orders?edit=${orderId}`);
      return;
    }

    if (editingId !== null) {
      notify(
        "Zakończ lub cofnij edycję zapisanej kalkulacji"
      );
      return;
    }

    const validLines = lines.filter(
      (line) =>
        line.material_id &&
        parseNumber(line.layers) > 0
    );

    if (validLines.length === 0) {
      notify("Dodaj przynajmniej jeden materiał");
      return;
    }

    if (deductStock && result.insufficient) {
      notify("Za mało materiału na stanie");
      return;
    }

    setCreatingOrder(true);

    try {
      const response = await api(
        "/api/calculations/actions/create-order",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            order_id: null,
            name:
              name.trim() ||
              "Kalkulacja naklejki",
            width_cm: parseNumber(width),
            height_cm: parseNumber(height),
            quantity: Math.max(
              1,
              Math.round(parseNumber(quantity))
            ),
            waste_percent: parseNumber(waste),
            labor_minutes:
              parseNumber(laborMinutes),
            hourly_rate: parseNumber(hourlyRate),
            margin_percent: parseNumber(margin),
            materials: validLines.map((line) => ({
              material_id: Number(line.material_id),
              layers: parseNumber(line.layers),
            })),
            deduct_stock: deductStock,
            update_order_price: false,
            notes: notes.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Nie udało się utworzyć zamówienia"
        );
      }

      notify(`Utworzono ${data.order.order_number}`);

      router.push(
        `/orders?edit=${data.order.id}`
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Nie udało się utworzyć zamówienia"
      );
    } finally {
      setCreatingOrder(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,.12),transparent_34%),radial-gradient(circle_at_10%_100%,rgba(6,182,212,.08),transparent_28%)]" />

      <header className="sticky top-0 z-30 border-b border-white/[.06] bg-[#090b10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1500px] items-center justify-between px-4 sm:px-6 xl:px-8">
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/")}
              className="secondary-button compact"
            >
              <ArrowLeft className="size-4" />
              Dashboard
            </button>

            <button
              onClick={() => router.push("/materials")}
              className="secondary-button compact"
            >
              <Boxes className="size-4" />
              Materiały
            </button>
          </div>

          <div className="flex gap-2">
            {editingId !== null && (
              <button
                onClick={resetEditor}
                className="secondary-button"
              >
                <RotateCcw className="size-4" />
                Anuluj edycję
              </button>
            )}

            <button
              onClick={save}
              disabled={saving}
              className="primary-button"
            >
              <Save className="size-4" />
              {saving
                ? "Zapisywanie..."
                : editingId !== null
                  ? "Zapisz zmiany"
                  : "Zapisz"}
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-4 py-7 sm:px-6 xl:px-8 xl:py-10">
        <section>
          <div className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
            Koszt i cena sprzedaży
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">
            Kalkulator produkcji
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Materiały, odpad, robocizna, marża i zapis do zamówienia.
          </p>

          {editingId !== null && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/25 bg-violet-400/[.07] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-violet-100">
                <PencilLine className="size-4" />
                Edytujesz zapisaną kalkulację. Zapis zastąpi jej dotychczasowe dane.
              </div>
              <button
                onClick={resetEditor}
                className="secondary-button compact"
              >
                <RotateCcw className="size-4" />
                Cofnij edycję
              </button>
            </div>
          )}
        </section>

        {loading ? (
          <div className="grid min-h-[500px] place-items-center">
            <LoaderCircle className="size-7 animate-spin text-white/25" />
          </div>
        ) : (
          <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_.75fr]">
            <div className="space-y-5">
              <section className="surface-card p-5 sm:p-6">
                <div className="flex items-center gap-2 font-semibold">
                  <ReceiptText className="size-5 text-violet-300" />
                  Dane kalkulacji
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="field">
                    <span>Zamówienie</span>
                    <select
                      value={orderId}
                      onChange={(event) => setOrderId(event.target.value)}
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
                    <span>Nazwa</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Szerokość [cm]</span>
                    <input
                      inputMode="decimal"
                      value={width}
                      onChange={(event) => setWidth(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Wysokość [cm]</span>
                    <input
                      inputMode="decimal"
                      value={height}
                      onChange={(event) => setHeight(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Ilość [szt.]</span>
                    <input
                      inputMode="numeric"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Odpad [%]</span>
                    <input
                      inputMode="decimal"
                      value={waste}
                      onChange={(event) => setWaste(event.target.value)}
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-white/[.06] bg-white/[.025] p-4 text-sm text-white/45">
                  Powierzchnia bazowa:{" "}
                  <span className="font-semibold text-white/80">
                    {number(result.baseArea, 4)} m²
                  </span>
                </div>
              </section>

              <section className="surface-card p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Boxes className="size-5 text-cyan-300" />
                    Materiały
                  </div>

                  <button
                    onClick={addLine}
                    className="secondary-button compact"
                  >
                    <Plus className="size-4" />
                    Dodaj warstwę
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {lines.map((line, index) => {
                    const row = result.breakdown.find(
                      (item) => item.key === line.key
                    );

                    return (
                      <div
                        key={line.key}
                        className="rounded-2xl border border-white/[.06] bg-white/[.02] p-4"
                      >
                        <div className="grid gap-3 sm:grid-cols-[1fr_115px_44px]">
                          <label className="field">
                            <span>Materiał {index + 1}</span>
                            <select
                              value={line.material_id}
                              onChange={(event) =>
                                updateLine(
                                  line.key,
                                  "material_id",
                                  event.target.value
                                )
                              }
                            >
                              <option value="">Wybierz materiał</option>
                              {materials.map((material) => (
                                <option key={material.id} value={material.id}>
                                  {material.name}
                                  {material.color_name
                                    ? ` · ${material.color_name}`
                                    : ""}
                                  {material.color_code
                                    ? ` · ${material.color_code}`
                                    : ""}
                                  {` · ${number(material.stock_length_m)} m`}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field">
                            <span>Mnożnik</span>
                            <input
                              inputMode="decimal"
                              value={line.layers}
                              onChange={(event) =>
                                updateLine(
                                  line.key,
                                  "layers",
                                  event.target.value
                                )
                              }
                            />
                          </label>

                          <button
                            onClick={() => removeLine(line.key)}
                            className="icon-button mt-auto"
                            title="Usuń"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>

                        {row?.material && (
                          <div
                            className={`mt-3 grid gap-2 rounded-xl border px-3 py-3 text-xs sm:grid-cols-3 ${
                              row.insufficient
                                ? "border-red-400/20 bg-red-400/[.05] text-red-200"
                                : "border-white/[.055] bg-white/[.02] text-white/45"
                            }`}
                          >
                            <div>
                              Powierzchnia:{" "}
                              <strong>{number(row.area, 4)} m²</strong>
                            </div>
                            <div>
                              Długość rolki:{" "}
                              <strong>{number(row.length)} m</strong>
                            </div>
                            <div>
                              Koszt: <strong>{money(row.cost)}</strong>
                            </div>

                            {row.insufficient && (
                              <div className="flex items-center gap-2 sm:col-span-3">
                                <TriangleAlert className="size-4" />
                                Dostępne tylko{" "}
                                {number(row.material.stock_length_m)} m
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="surface-card p-5 sm:p-6">
                <div className="flex items-center gap-2 font-semibold">
                  <Calculator className="size-5 text-amber-300" />
                  Robocizna i marża
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <label className="field">
                    <span>Czas pracy [min]</span>
                    <input
                      inputMode="decimal"
                      value={laborMinutes}
                      onChange={(event) =>
                        setLaborMinutes(event.target.value)
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Stawka [zł/h]</span>
                    <input
                      inputMode="decimal"
                      value={hourlyRate}
                      onChange={(event) => setHourlyRate(event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>Marża [%]</span>
                    <input
                      inputMode="decimal"
                      value={margin}
                      onChange={(event) => setMargin(event.target.value)}
                    />
                  </label>

                  <label className="field sm:col-span-3">
                    <span>Notatki</span>
                    <textarea
                      rows={4}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                </div>
              </section>
            </div>

            <aside>
              <section className="surface-card sticky top-[92px] p-5 sm:p-6">
                <div className="flex items-center gap-2 font-semibold">
                  <CircleDollarSign className="size-5 text-emerald-300" />
                  Podsumowanie
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex justify-between text-sm text-white/50">
                    <span>Materiały</span>
                    <strong className="text-white/80">
                      {money(result.materialCost)}
                    </strong>
                  </div>

                  <div className="flex justify-between text-sm text-white/50">
                    <span>Robocizna</span>
                    <strong className="text-white/80">
                      {money(result.laborCost)}
                    </strong>
                  </div>

                  <div className="flex justify-between border-t border-white/[.07] pt-4">
                    <span className="text-sm text-white/55">
                      Koszt produkcji
                    </span>
                    <strong className="text-xl">
                      {money(result.totalCost)}
                    </strong>
                  </div>

                  <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[.06] p-4">
                    <div className="text-xs text-violet-200/60">
                      Sugerowana cena
                    </div>
                    <div className="mt-2 text-3xl font-semibold text-violet-100">
                      {money(result.suggestedPrice)}
                    </div>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-white/45">Zysk</span>
                    <strong className="text-emerald-300">
                      {money(result.profit)}
                    </strong>
                  </div>
                </div>

                <div className="mt-6 space-y-3 border-t border-white/[.07] pt-5">
                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                    <input
                      type="checkbox"
                      checked={updateOrderPrice}
                      disabled={!orderId}
                      onChange={(event) =>
                        setUpdateOrderPrice(event.target.checked)
                      }
                      className="mt-0.5 size-4 accent-violet-500"
                    />
                    <span>
                      <strong className="block text-sm">
                        Przenieś cenę do zamówienia
                      </strong>
                      <span className="mt-1 block text-xs text-white/35">
                        Ustawia sugerowaną cenę w polu Cena.
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-4">
                    <input
                      type="checkbox"
                      checked={deductStock}
                      onChange={(event) =>
                        setDeductStock(event.target.checked)
                      }
                      className="mt-0.5 size-4 accent-violet-500"
                    />
                    <span>
                      <strong className="block text-sm">
                        Odejmij materiał z magazynu
                      </strong>
                      <span className="mt-1 block text-xs text-white/35">
                        Zużycie zostanie odjęte przy zapisie.
                      </span>
                    </span>
                  </label>
                </div>

                {result.insufficient && (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    Jednego z materiałów jest za mało.
                  </div>
                )}

                {editingId === null && (
                  <button
                    onClick={createOrderFromCalculator}
                    disabled={saving || creatingOrder}
                    className="secondary-button mt-5 w-full justify-center border-emerald-400/25 bg-emerald-400/[.06] text-emerald-200 hover:bg-emerald-400/[.1] disabled:opacity-60"
                  >
                    <ShoppingBag className="size-4" />
                    {orderId
                      ? "Otwórz przypisane zamówienie"
                      : creatingOrder
                        ? "Tworzenie zamówienia..."
                        : "Utwórz zamówienie"}
                  </button>
                )}

                <button
                  onClick={save}
                  disabled={saving || creatingOrder}
                  className="primary-button mt-3 w-full justify-center"
                >
                  <Save className="size-4" />
                  {saving
                    ? "Zapisywanie..."
                    : editingId !== null
                      ? "Zapisz zmiany"
                      : "Zapisz samą kalkulację"}
                </button>
              </section>
            </aside>
          </div>
        )}

        <section className="surface-card mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.055] p-5">
            <div className="flex items-center gap-2 font-semibold">
              <ShoppingBag className="size-5 text-violet-300" />
              {showDeleted ? "Usunięte kalkulacje" : "Ostatnie kalkulacje"}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-white/30">{history.length}</span>
              <button
                onClick={() => setShowDeleted((current) => !current)}
                className="secondary-button compact"
              >
                <RotateCcw className="size-4" />
                {showDeleted ? "Wróć do aktywnych" : "Pokaż usunięte"}
              </button>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="grid min-h-[180px] place-items-center text-sm text-white/30">
              {showDeleted
                ? "Brak usuniętych kalkulacji"
                : "Brak zapisanych kalkulacji"}
            </div>
          ) : (
            <div className="divide-y divide-white/[.045]">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[130px_1fr_120px_120px_auto] sm:items-center"
                >
                  <div className="text-xs font-semibold text-violet-200">
                    {item.calculation_number}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-white/30">
                      {item.order_number || "Bez zamówienia"} ·{" "}
                      {number(item.width_cm)} × {number(item.height_cm)} cm ·{" "}
                      {item.quantity} szt.
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/30">Koszt</div>
                    <strong className="text-sm">
                      {money(item.total_cost)}
                    </strong>
                  </div>
                  <div>
                    <div className="text-xs text-white/30">Cena</div>
                    <strong className="text-sm text-emerald-300">
                      {money(item.suggested_price)}
                    </strong>
                  </div>

                  <div className="flex justify-end gap-2">
                    {item.is_deleted ? (
                      <button
                        onClick={() => void changeDeletedState(item)}
                        className="secondary-button compact"
                        title="Cofnij usunięcie"
                      >
                        <RotateCcw className="size-4" />
                        Przywróć
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => editCalculation(item)}
                          className="secondary-button compact"
                          title="Edytuj kalkulację"
                        >
                          <PencilLine className="size-4" />
                          Edytuj
                        </button>

                        <button
                          onClick={() => void changeDeletedState(item)}
                          className="icon-button text-red-200"
                          title="Usuń kalkulację"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {message && (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl border border-emerald-400/20 bg-[#101a16]/95 px-4 py-3 text-sm shadow-2xl">
          {message}
        </div>
      )}
    </main>
  );
}
