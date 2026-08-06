"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  Download,
  FileImage,
  FolderSearch,
  Library,
  LoaderCircle,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

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
  version_label: string;
  is_production_ready: boolean;
};

async function readError(
  response: Response,
  fallback: string
) {
  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    contentType.includes(
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

function formatFileSize(
  value: number
) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (
    value < 1024 * 1024
  ) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    value / 1024 / 1024
  ).toFixed(1)} MB`;
}

function AuthSvgPreview({
  assetId,
  className =
    "size-24",
}: {
  assetId: number;
  className?: string;
}) {
  const [url, setUrl] =
    useState("");

  const [failed, setFailed] =
    useState(false);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    const load = async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        setFailed(true);
        return;
      }

      try {
        const response =
          await fetch(
            `/api/svg-assets/${assetId}/file`,
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
              cache: "no-store",
            }
          );

        if (!response.ok) {
          throw new Error();
        }

        objectUrl =
          URL.createObjectURL(
            await response.blob()
          );

        if (!cancelled) {
          setUrl(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [assetId]);

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[.07] bg-white/[.025] ${className}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt="Podgląd SVG"
          className="size-full object-contain p-3"
          onError={() =>
            setFailed(true)
          }
        />
      ) : failed ? (
        <FileImage className="size-8 text-white/15" />
      ) : (
        <LoaderCircle className="size-5 animate-spin text-white/20" />
      )}
    </div>
  );
}

function UploadOrderSvg({
  orderId,
  clientName,
  onClose,
  onCreated,
}: {
  orderId: number;
  clientName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [file, setFile] =
    useState<File | null>(
      null
    );

  const [name, setName] =
    useState("");

  const [
    version,
    setVersion,
  ] = useState("v1");

  const [
    category,
    setCategory,
  ] = useState("Grafika");

  const [tags, setTags] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const submit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (!file) {
      setError(
        "Wybierz plik SVG"
      );
      return;
    }

    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setError(
        "Sesja wygasła"
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body =
        new FormData();

      body.append("file", file);

      body.append(
        "name",
        name.trim()
          || file.name.replace(
            /\.svg$/i,
            ""
          )
      );

      body.append(
        "category",
        category
      );

      body.append(
        "tags",
        tags
      );

      body.append(
        "client_name",
        clientName
      );

      body.append(
        "order_id",
        String(orderId)
      );

      body.append(
        "version_label",
        version
      );

      body.append(
        "notes",
        ""
      );

      const response =
        await fetch(
          "/api/svg-assets",
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
            body,
          }
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się dodać SVG"
          )
        );
      }

      onCreated();
    } catch (
      uploadError
    ) {
      setError(
        uploadError
          instanceof Error
          ? uploadError.message
          : "Nie udało się dodać SVG"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <form
        onSubmit={submit}
        className="surface-card relative z-10 w-full max-w-xl p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Nowy projekt
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              Dodaj plik SVG
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

        <label className="mt-6 grid min-h-[130px] cursor-pointer place-items-center rounded-3xl border border-dashed border-violet-400/25 bg-violet-400/[.035] p-5 text-center">
          <input
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(
              event
            ) => {
              const selected =
                event.target
                  .files?.[0]
                || null;

              setFile(
                selected
              );

              if (
                selected
                && !name.trim()
              ) {
                setName(
                  selected.name
                    .replace(
                      /\.svg$/i,
                      ""
                    )
                );
              }
            }}
          />

          <div>
            <Upload className="mx-auto size-7 text-violet-300" />

            <div className="mt-3 text-sm font-medium">
              {file
                ? file.name
                : "Kliknij i wybierz SVG"}
            </div>
          </div>
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>
              Nazwa projektu
            </span>

            <input
              required
              value={name}
              onChange={(
                event
              ) =>
                setName(
                  event.target.value
                )
              }
            />
          </label>

          <label className="field">
            <span>Wersja</span>

            <input
              value={version}
              onChange={(
                event
              ) =>
                setVersion(
                  event.target.value
                )
              }
            />
          </label>

          <label className="field">
            <span>
              Kategoria
            </span>

            <select
              value={category}
              onChange={(
                event
              ) =>
                setCategory(
                  event.target.value
                )
              }
            >
              <option>
                Grafika
              </option>
              <option>
                Logo
              </option>
              <option>
                Tekst
              </option>
              <option>
                Naklejka social media
              </option>
              <option>
                Motoryzacja
              </option>
              <option>
                Inne
              </option>
            </select>
          </label>

          <label className="field sm:col-span-2">
            <span>Tagi</span>

            <input
              value={tags}
              onChange={(
                event
              ) =>
                setTags(
                  event.target.value
                )
              }
              placeholder="np. instagram, nfc, final"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
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
            <Upload className="size-4" />

            {saving
              ? "Dodawanie..."
              : "Dodaj projekt"}
          </button>
        </div>
      </form>
    </div>
  );
}

function LibraryPicker({
  orderId,
  assignedIds,
  onClose,
  onAssigned,
}: {
  orderId: number;
  assignedIds: number[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [assets, setAssets] =
    useState<SvgAsset[]>([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [busyId, setBusyId] =
    useState<number | null>(
      null
    );

  const [error, setError] =
    useState("");

  useEffect(() => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const response =
          await fetch(
            "/api/svg-assets?archived=false&limit=1000",
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
            await readError(
              response,
              "Nie udało się pobrać biblioteki"
            )
          );
        }

        setAssets(
          await response.json()
        );
      } catch (
        loadError
      ) {
        setError(
          loadError
            instanceof Error
            ? loadError.message
            : "Nie udało się pobrać biblioteki"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const visible =
    useMemo(() => {
      const phrase =
        search
          .trim()
          .toLocaleLowerCase(
            "pl"
          );

      return assets.filter(
        (asset) => {
          if (
            assignedIds.includes(
              asset.id
            )
          ) {
            return false;
          }

          if (!phrase) {
            return true;
          }

          return [
            asset.asset_number,
            asset.name,
            asset.category,
            asset.client_name,
            asset.order_number
              || "",
            asset.version_label,
            ...(
              asset.tags
              || []
            ),
          ]
            .join(" ")
            .toLocaleLowerCase(
              "pl"
            )
            .includes(
              phrase
            );
        }
      );
    }, [
      assets,
      search,
      assignedIds,
    ]);

  const assign = async (
    asset: SvgAsset
  ) => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    setBusyId(
      asset.id
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/svg-assets/${asset.id}/assign-order`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              order_id: orderId,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się przypisać projektu"
          )
        );
      }

      onAssigned();
    } catch (
      assignError
    ) {
      setError(
        assignError
          instanceof Error
          ? assignError.message
          : "Nie udało się przypisać projektu"
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <section className="surface-card relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-white/[.06] p-5 sm:p-7">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Istniejące projekty
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              Wybierz z biblioteki SVG
            </h2>
          </div>

          <button
            onClick={onClose}
            className="icon-button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="border-b border-white/[.06] p-4 sm:p-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />

            <input
              autoFocus
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              className="h-11 w-full rounded-2xl border border-white/[.08] bg-white/[.03] pl-11 pr-4 text-sm outline-none focus:border-violet-400/45"
              placeholder="Szukaj nazwy, klienta, numeru SVG, tagu lub zamówienia..."
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="grid min-h-72 place-items-center">
              <LoaderCircle className="size-7 animate-spin text-white/25" />
            </div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-72 place-items-center text-center">
              <div>
                <FolderSearch className="mx-auto size-10 text-white/15" />

                <div className="mt-4 font-medium">
                  Brak pasujących projektów
                </div>

                <div className="mt-2 text-sm text-white/35">
                  Zmień wyszukiwanie albo dodaj nowy SVG.
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map(
                (asset) => (
                  <article
                    key={asset.id}
                    className="flex gap-4 rounded-3xl border border-white/[.065] bg-white/[.02] p-4"
                  >
                    <AuthSvgPreview
                      assetId={asset.id}
                      className="size-24"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-semibold text-white/90">
                          {asset.name}
                        </div>

                        <span className="rounded-full border border-white/[.08] px-2 py-1 text-[10px] text-white/45">
                          {asset.version_label}
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-white/35">
                        {asset.asset_number}
                        {" · "}
                        {asset.category}
                      </div>

                      <div className="mt-1 truncate text-xs text-white/30">
                        {asset.client_name
                          || "Bez klienta"}

                        {asset.order_number
                          ? ` · obecnie ${asset.order_number}`
                          : " · bez zamówienia"}
                      </div>

                      <button
                        onClick={() =>
                          void assign(
                            asset
                          )
                        }
                        disabled={
                          busyId
                          === asset.id
                        }
                        className="secondary-button compact mt-4 border-violet-400/20 text-violet-200 disabled:opacity-60"
                      >
                        {busyId
                          === asset.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Library className="size-4" />
                        )}

                        Przypisz do zamówienia
                      </button>
                    </div>
                  </article>
                )
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function OrderSvgAssets({
  orderId,
  clientName,
}: {
  orderId: number;
  clientName: string;
}) {
  const [assets, setAssets] =
    useState<SvgAsset[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [uploadOpen, setUploadOpen] =
    useState(false);

  const [
    libraryOpen,
    setLibraryOpen,
  ] = useState(false);

  const [busyId, setBusyId] =
    useState<number | null>(
      null
    );

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const load = async () => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/orders/${orderId}/svg-assets`,
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
          await readError(
            response,
            "Nie udało się pobrać projektów"
          )
        );
      }

      setAssets(
        await response.json()
      );
    } catch (
      loadError
    ) {
      setError(
        loadError
          instanceof Error
          ? loadError.message
          : "Nie udało się pobrać projektów"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  const setReady = async (
    assetId: number
  ) => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    setBusyId(
      assetId
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/svg-assets/${assetId}/set-production-ready`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się ustawić wersji produkcyjnej"
          )
        );
      }

      setMessage(
        "Ustawiono plik produkcyjny"
      );

      window.setTimeout(
        () => setMessage(""),
        2400
      );

      await load();
    } catch (
      readyError
    ) {
      setError(
        readyError
          instanceof Error
          ? readyError.message
          : "Operacja nie powiodła się"
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeFromOrder = async (
    asset: SvgAsset
  ) => {
    const confirmed =
      window.confirm(
        `Usunąć projekt "${asset.name}" z tego zamówienia?\n\nPlik pozostanie w Bibliotece SVG.`
      );

    if (!confirmed) {
      return;
    }

    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    setBusyId(
      asset.id
    );

    setError("");

    try {
      const response =
        await fetch(
          `/api/svg-assets/${asset.id}/unassign-order`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              order_id: orderId,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się usunąć projektu z zamówienia"
          )
        );
      }

      setMessage(
        "Projekt usunięty z zamówienia"
      );

      window.setTimeout(
        () => setMessage(""),
        2400
      );

      await load();
    } catch (
      removeError
    ) {
      setError(
        removeError
          instanceof Error
          ? removeError.message
          : "Nie udało się usunąć projektu z zamówienia"
      );
    } finally {
      setBusyId(null);
    }
  };

  const download = async (
    asset: SvgAsset
  ) => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      return;
    }

    const response =
      await fetch(
        `/api/svg-assets/${asset.id}/file?download=true`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    if (!response.ok) {
      setError(
        await readError(
          response,
          "Nie udało się pobrać SVG"
        )
      );

      return;
    }

    const url =
      URL.createObjectURL(
        await response.blob()
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      asset.original_filename;

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const success = (
    text: string
  ) => {
    setMessage(text);

    window.setTimeout(
      () => setMessage(""),
      2400
    );

    void load();
  };

  return (
    <>
      <section className="surface-card mt-5 overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <FileImage className="size-5 text-violet-300" />
              Projekty SVG
            </div>

            <div className="mt-1 text-xs text-white/35">
              Dodaj nowy plik albo wybierz istniejący projekt z biblioteki.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                setLibraryOpen(
                  true
                )
              }
              className="secondary-button"
            >
              <Library className="size-4" />
              Wybierz z biblioteki
            </button>

            <button
              onClick={() =>
                setUploadOpen(
                  true
                )
              }
              className="secondary-button"
            >
              <Plus className="size-4" />
              Dodaj nowy SVG
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[170px] place-items-center">
            <LoaderCircle className="size-5 animate-spin text-white/25" />
          </div>
        ) : assets.length === 0 ? (
          <div className="grid min-h-[170px] place-items-center px-5 text-center">
            <div>
              <FileImage className="mx-auto size-9 text-white/15" />

              <div className="mt-3 text-sm font-medium">
                Brak projektu SVG
              </div>

              <div className="mt-1 text-xs text-white/35">
                Wybierz istniejący projekt z biblioteki albo wgraj nowy.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[.055]">
            {assets.map(
              (asset) => (
                <article
                  key={asset.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
                >
                  <AuthSvgPreview
                    assetId={asset.id}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white/90">
                        {asset.name}
                      </div>

                      <span className="rounded-full border border-white/[.08] bg-white/[.03] px-2 py-1 text-[10px] text-white/45">
                        {asset.version_label}
                      </span>

                      {asset.is_production_ready && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/[.07] px-2 py-1 text-[10px] text-emerald-200">
                          <CheckCircle2 className="size-3" />
                          Produkcyjny
                        </span>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-white/35">
                      {asset.asset_number}
                      {" · "}
                      {asset.category}
                      {" · "}
                      {formatFileSize(
                        asset.file_size
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        void download(
                          asset
                        )
                      }
                      className="secondary-button compact"
                    >
                      <Download className="size-4" />
                      Pobierz
                    </button>

                    {!asset.is_production_ready && (
                      <button
                        onClick={() =>
                          void setReady(
                            asset.id
                          )
                        }
                        disabled={
                          busyId
                          === asset.id
                        }
                        className="secondary-button compact border-emerald-400/20 text-emerald-200 disabled:opacity-60"
                      >
                        <PackageCheck className="size-4" />
                        Ustaw produkcyjny
                      </button>
                    )}

                    <button
                      onClick={() =>
                        void removeFromOrder(
                          asset
                        )
                      }
                      disabled={
                        busyId
                        === asset.id
                      }
                      className="secondary-button compact border-red-400/20 text-red-200 hover:bg-red-400/[.06] disabled:opacity-60"
                    >
                      {busyId
                        === asset.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}

                      Usuń z zamówienia
                    </button>
                  </div>
                </article>
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

      {uploadOpen && (
        <UploadOrderSvg
          orderId={orderId}
          clientName={clientName}
          onClose={() =>
            setUploadOpen(
              false
            )
          }
          onCreated={() => {
            setUploadOpen(
              false
            );

            success(
              "Dodano nowy projekt SVG"
            );
          }}
        />
      )}

      {libraryOpen && (
        <LibraryPicker
          orderId={orderId}
          assignedIds={assets.map(
            (asset) => asset.id
          )}
          onClose={() =>
            setLibraryOpen(
              false
            )
          }
          onAssigned={() => {
            setLibraryOpen(
              false
            );

            success(
              "Przypisano projekt z biblioteki"
            );
          }}
        />
      )}
    </>
  );
}
