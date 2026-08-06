"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Archive,
  CheckSquare,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";

type Entity =
  | "clients"
  | "orders"
  | "materials";

type BulkItem = {
  id: number;
  [key: string]: unknown;
};

const entityLabels: Record<
  Entity,
  {
    singular: string;
    plural: string;
    searchPlaceholder: string;
  }
> = {
  clients: {
    singular: "klienta",
    plural: "klientów",
    searchPlaceholder:
      "Szukaj nazwy, NIP-u, telefonu lub e-maila...",
  },
  orders: {
    singular: "zamówienie",
    plural: "zamówień",
    searchPlaceholder:
      "Szukaj numeru, klienta, nazwy lub statusu...",
  },
  materials: {
    singular: "materiał",
    plural: "materiałów",
    searchPlaceholder:
      "Szukaj nazwy, marki, serii lub koloru...",
  },
};

function asText(
  value: unknown
) {
  if (
    value === null
    || value === undefined
  ) {
    return "";
  }

  return String(value);
}

function money(
  value: unknown
) {
  const number = Number(value || 0);

  return new Intl.NumberFormat(
    "pl-PL",
    {
      style: "currency",
      currency: "PLN",
    }
  ).format(
    Number.isFinite(number)
      ? number
      : 0
  );
}

function itemLabel(
  entity: Entity,
  item: BulkItem
) {
  if (entity === "clients") {
    return (
      asText(item.display_name)
      || asText(item.company_name)
      || `${asText(item.first_name)} ${asText(item.last_name)}`.trim()
      || `Klient #${item.id}`
    );
  }

  if (entity === "orders") {
    return (
      asText(item.order_number)
      || `Zamówienie #${item.id}`
    );
  }

  return (
    asText(item.name)
    || asText(item.material_name)
    || `Materiał #${item.id}`
  );
}

function itemMeta(
  entity: Entity,
  item: BulkItem
) {
  if (entity === "clients") {
    return [
      asText(item.client_number),
      item.nip
        ? `NIP ${asText(item.nip)}`
        : "",
      asText(item.email),
      asText(item.phone),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (entity === "orders") {
    return [
      asText(item.client_name),
      asText(item.name),
      asText(item.status),
      money(item.price),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return [
    asText(item.brand),
    asText(item.series),
    asText(item.color_name),
    item.color_code
      ? `kod ${asText(item.color_code)}`
      : "",
    item.current_length_m !== undefined
      ? `${asText(item.current_length_m)} m`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function searchableText(
  item: BulkItem
) {
  return Object.values(item)
    .flatMap((value) =>
      Array.isArray(value)
        ? value
        : [value]
    )
    .map(asText)
    .join(" ")
    .toLocaleLowerCase("pl");
}

async function apiError(
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

function BulkOperationsModal({
  entity,
  onClose,
}: {
  entity: Entity;
  onClose: () => void;
}) {
  const [archived, setArchived] =
    useState(false);

  const [items, setItems] =
    useState<BulkItem[]>([]);

  const [selectedIds, setSelectedIds] =
    useState<number[]>([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [working, setWorking] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const labels =
    entityLabels[entity];

  const load = async () => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setError("Sesja wygasła");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setSelectedIds([]);

    try {
      const params =
        new URLSearchParams({
          archived:
            String(archived),
          limit:
            entity === "orders"
              ? "500"
              : "1000",
        });

      const response =
        await fetch(
          `/api/${entity}?${params.toString()}`,
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
          await apiError(
            response,
            `Nie udało się pobrać ${labels.plural}`
          )
        );
      }

      const data =
        await response.json();

      setItems(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : `Nie udało się pobrać ${labels.plural}`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [archived, entity]);

  const visibleItems =
    useMemo(() => {
      const phrase =
        search
          .trim()
          .toLocaleLowerCase("pl");

      if (!phrase) {
        return items;
      }

      return items.filter(
        (item) =>
          searchableText(item)
            .includes(phrase)
      );
    }, [
      items,
      search,
    ]);

  const visibleIds =
    visibleItems.map(
      (item) => item.id
    );

  const allVisibleSelected =
    visibleIds.length > 0
    && visibleIds.every(
      (id) =>
        selectedIds.includes(id)
    );

  const toggleItem = (
    id: number
  ) => {
    setSelectedIds(
      (current) =>
        current.includes(id)
          ? current.filter(
              (value) =>
                value !== id
            )
          : [
              ...current,
              id,
            ]
    );
  };

  const toggleVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(
        (current) =>
          current.filter(
            (id) =>
              !visibleIds.includes(id)
          )
      );

      return;
    }

    setSelectedIds(
      (current) =>
        Array.from(
          new Set([
            ...current,
            ...visibleIds,
          ])
        )
    );
  };

  const run = async (
    action:
      | "archive"
      | "restore"
      | "delete"
  ) => {
    if (
      selectedIds.length === 0
    ) {
      setError(
        "Zaznacz przynajmniej jedną pozycję"
      );

      return;
    }

    if (
      action === "delete"
    ) {
      const confirmed =
        window.confirm(
          `Trwale usunąć ${selectedIds.length} ${labels.plural}?\n\nTej operacji nie można cofnąć. Powiązane zamówienia i projekty nie zostaną usunięte bez ostrzeżenia.`
        );

      if (!confirmed) {
        return;
      }
    }

    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setError("Sesja wygasła");
      return;
    }

    setWorking(true);
    setError("");
    setMessage("");

    try {
      const response =
        await fetch(
          `/api/bulk/${entity}`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              ids: selectedIds,
              action,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          await apiError(
            response,
            "Operacja nie powiodła się"
          )
        );
      }

      const result =
        await response.json();

      setMessage(
        result.message
        || "Operacja wykonana"
      );

      setSelectedIds([]);

      await load();

      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : "Operacja nie powiodła się"
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-3 backdrop-blur-md sm:p-5">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <section className="surface-card relative z-10 flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-start sm:p-7">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Zarządzanie zbiorcze
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              Operacje masowe — {labels.plural}
            </h2>

            <div className="mt-2 text-sm text-white/35">
              Zaznacz pozycje, a następnie wybierz operację.
            </div>
          </div>

          <button
            onClick={onClose}
            className="icon-button self-end sm:self-auto"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-3 border-b border-white/[.06] p-4 sm:p-5 lg:grid-cols-[auto_1fr_auto]">
          <div className="flex rounded-2xl border border-white/[.07] bg-white/[.025] p-1">
            <button
              onClick={() =>
                setArchived(false)
              }
              className={`rounded-xl px-4 py-2 text-sm transition ${
                !archived
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-white/40"
              }`}
            >
              Aktywne
            </button>

            <button
              onClick={() =>
                setArchived(true)
              }
              className={`rounded-xl px-4 py-2 text-sm transition ${
                archived
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-white/40"
              }`}
            >
              Archiwum
            </button>
          </div>

          <label className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              className="h-11 w-full rounded-2xl border border-white/[.08] bg-white/[.03] pl-11 pr-4 text-sm outline-none focus:border-violet-400/45"
              placeholder={
                labels.searchPlaceholder
              }
            />
          </label>

          <button
            onClick={toggleVisible}
            disabled={
              visibleItems.length === 0
            }
            className="secondary-button justify-center disabled:opacity-40"
          >
            {allVisibleSelected ? (
              <CheckSquare className="size-4 text-violet-300" />
            ) : (
              <Square className="size-4" />
            )}

            {allVisibleSelected
              ? "Odznacz widoczne"
              : "Zaznacz widoczne"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid min-h-[360px] place-items-center">
              <LoaderCircle className="size-7 animate-spin text-white/25" />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="grid min-h-[360px] place-items-center text-center">
              <div>
                <Archive className="mx-auto size-10 text-white/15" />

                <div className="mt-4 font-medium">
                  Brak pozycji
                </div>

                <div className="mt-2 text-sm text-white/35">
                  Zmień wyszukiwanie lub wybierz drugą zakładkę.
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[.055]">
              {visibleItems.map(
                (item) => {
                  const checked =
                    selectedIds.includes(
                      item.id
                    );

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        toggleItem(
                          item.id
                        )
                      }
                      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${
                        checked
                          ? "bg-violet-500/[.07]"
                          : "hover:bg-white/[.025]"
                      }`}
                    >
                      <span
                        className={`grid size-6 shrink-0 place-items-center rounded-lg border ${
                          checked
                            ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                            : "border-white/[.12] text-transparent"
                        }`}
                      >
                        <PackageCheck className="size-4" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white/90">
                          {itemLabel(
                            entity,
                            item
                          )}
                        </span>

                        <span className="mt-1 block truncate text-xs text-white/32">
                          {itemMeta(
                            entity,
                            item
                          ) || `ID ${item.id}`}
                        </span>
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          )}
        </div>

        <div className="border-t border-white/[.06] bg-[#0d1117] p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="text-sm text-white/40">
              Zaznaczono:{" "}
              <strong className="text-white/85">
                {selectedIds.length}
              </strong>
            </div>

            <div className="flex flex-wrap gap-2">
              {archived ? (
                <button
                  onClick={() =>
                    void run(
                      "restore"
                    )
                  }
                  disabled={
                    working
                    || selectedIds.length === 0
                  }
                  className="secondary-button border-emerald-400/20 text-emerald-200 disabled:opacity-40"
                >
                  <RefreshCw className="size-4" />
                  Przywróć zaznaczone
                </button>
              ) : (
                <button
                  onClick={() =>
                    void run(
                      "archive"
                    )
                  }
                  disabled={
                    working
                    || selectedIds.length === 0
                  }
                  className="secondary-button border-amber-400/20 text-amber-200 disabled:opacity-40"
                >
                  <Archive className="size-4" />
                  Archiwizuj zaznaczone
                </button>
              )}

              <button
                onClick={() =>
                  void run(
                    "delete"
                  )
                }
                disabled={
                  working
                  || selectedIds.length === 0
                }
                className="secondary-button border-red-400/20 text-red-200 hover:bg-red-400/[.06] disabled:opacity-40"
              >
                {working ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}

                Usuń trwale
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function BulkOperationsButton({
  entity,
}: {
  entity: Entity;
}) {
  const [open, setOpen] =
    useState(false);

  return (
    <>
      <button
        onClick={() =>
          setOpen(true)
        }
        className="fixed bottom-5 left-5 z-[65] inline-flex h-11 items-center gap-2 rounded-2xl border border-violet-400/25 bg-[#151221]/95 px-4 text-sm font-semibold text-violet-100 shadow-[0_15px_45px_rgba(0,0,0,.45)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-400/45 lg:left-[280px]"
      >
        <CheckSquare className="size-4" />
        Operacje masowe
      </button>

      {open && (
        <BulkOperationsModal
          entity={entity}
          onClose={() =>
            setOpen(false)
          }
        />
      )}
    </>
  );
}
