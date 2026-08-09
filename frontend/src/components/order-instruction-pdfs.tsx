"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type InstructionType =
  | "application"
  | "care"
  | "social"
  | "nfc"
  | "custom";

type InstructionPdf = {
  id: number;
  order_id: number;
  instruction_type: InstructionType;
  title: string;
  version: number;
  stored_filename: string;
  file_size: number;
  custom_title: string | null;
  custom_text: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<
  InstructionType,
  string
> = {
  application:
    "Aplikacja naklejki",
  care:
    "Pielęgnacja",
  social:
    "Naklejka Social Media",
  nfc:
    "Naklejka z NFC",
  custom:
    "Własna instrukcja",
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

function formatDate(
  value: string
) {
  try {
    return new Intl.DateTimeFormat(
      "pl-PL",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function GenerateInstructionModal({
  orderId,
  orderNumber,
  clientName,
  orderName,
  initial,
  onClose,
  onGenerated,
}: {
  orderId: number;
  orderNumber: string;
  clientName: string;
  orderName: string;
  initial?: InstructionPdf | null;
  onClose: () => void;
  onGenerated: (
    pdf: InstructionPdf
  ) => void;
}) {
  const [
    instructionType,
    setInstructionType,
  ] = useState<InstructionType>(
    initial?.instruction_type
      || "application"
  );

  const [
    customTitle,
    setCustomTitle,
  ] = useState(
    initial?.custom_title
      || ""
  );

  const [
    customText,
    setCustomText,
  ] = useState(
    initial?.custom_text
      || ""
  );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const generate = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setError("Sesja wygasła");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/orders/${orderId}/instructions/generate`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              instruction_type:
                instructionType,
              custom_title:
                instructionType
                  === "custom"
                  ? customTitle
                  : null,
              custom_text:
                instructionType
                  === "custom"
                  ? customText
                  : null,
            }),
          }
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się wygenerować PDF"
          )
        );
      }

      onGenerated(
        await response.json()
      );
    } catch (
      generateError
    ) {
      setError(
        generateError
          instanceof Error
          ? generateError.message
          : "Nie udało się wygenerować PDF"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
      <button
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Zamknij"
      />

      <form
        onSubmit={generate}
        className="surface-card relative z-10 w-full max-w-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[.06] p-5 sm:p-7">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              Dokument dla klienta
            </div>

            <h2 className="mt-2 text-2xl font-semibold">
              {initial
                ? "Generuj nową wersję"
                : "Generuj instrukcję PDF"}
            </h2>

            <div className="mt-2 text-xs text-white/35">
              {orderNumber}
              {" · "}
              {clientName}
              {" · "}
              {orderName}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="icon-button"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <label className="field">
            <span>
              Typ instrukcji
            </span>

            <select
              value={instructionType}
              onChange={(
                event
              ) =>
                setInstructionType(
                  event.target
                    .value as InstructionType
                )
              }
            >
              <option value="application">
                Aplikacja naklejki
              </option>

              <option value="care">
                Pielęgnacja
              </option>

              <option value="social">
                Naklejka Social Media
              </option>

              <option value="nfc">
                Naklejka z NFC
              </option>

              <option value="custom">
                Własna instrukcja
              </option>
            </select>
          </label>

          <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[.04] p-4 text-sm text-white/45">
            <Sparkles className="mr-2 inline size-4 text-violet-300" />

            PDF automatycznie pobierze numer zamówienia,
            klienta, nazwę produktu, datę i przygotuje
            gotowy dokument YOKAI WRAP.
          </div>

          {instructionType
            === "custom" && (
            <>
              <label className="field">
                <span>
                  Tytuł instrukcji
                </span>

                <input
                  value={customTitle}
                  onChange={(
                    event
                  ) =>
                    setCustomTitle(
                      event.target.value
                    )
                  }
                  placeholder="np. Montaż zestawu na szybę"
                />
              </label>

              <label className="field">
                <span>
                  Treść
                </span>

                <textarea
                  required
                  value={customText}
                  onChange={(
                    event
                  ) =>
                    setCustomText(
                      event.target.value
                    )
                  }
                  rows={10}
                  placeholder={
                    "Przygotowanie\nOdtłuść powierzchnię...\n\nMontaż\nUstaw projekt..."
                  }
                />
              </label>
            </>
          )}

          {error && (
            <div className="rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/[.06] p-5 sm:p-6">
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
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}

            {saving
              ? "Generowanie..."
              : "Generuj PDF"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function OrderInstructionPdfs({
  orderId,
  orderNumber,
  clientName,
  orderName,
}: {
  orderId: number;
  orderNumber: string;
  clientName: string;
  orderName: string;
}) {
  const [pdfs, setPdfs] =
    useState<InstructionPdf[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [modalOpen, setModalOpen] =
    useState(false);

  const [regenerate, setRegenerate] =
    useState<InstructionPdf | null>(
      null
    );

  const [busyId, setBusyId] =
    useState<number | null>(
      null
    );

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const load = async () => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/orders/${orderId}/instructions`,
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
            "Nie udało się pobrać instrukcji"
          )
        );
      }

      setPdfs(
        await response.json()
      );
    } catch (
      loadError
    ) {
      setError(
        loadError
          instanceof Error
          ? loadError.message
          : "Nie udało się pobrać instrukcji"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  const fetchPdfBlob = async (
    pdf: InstructionPdf,
    download: boolean
  ) => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    if (!token) {
      throw new Error(
        "Sesja wygasła"
      );
    }

    const response =
      await fetch(
        `/api/order-instructions/${pdf.id}/file?download=${String(download)}`,
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
          "Nie udało się otworzyć PDF"
        )
      );
    }

    return response.blob();
  };

  const preview = async (
    pdf: InstructionPdf
  ) => {
    const previewWindow =
      window.open(
        "",
        "_blank"
      );

    setBusyId(pdf.id);
    setError("");

    try {
      const blob =
        await fetchPdfBlob(
          pdf,
          false
        );

      const url =
        URL.createObjectURL(
          blob
        );

      if (previewWindow) {
        previewWindow.location.href =
          url;
      } else {
        window.open(
          url,
          "_blank"
        );
      }

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        60000
      );
    } catch (
      previewError
    ) {
      previewWindow?.close();

      setError(
        previewError
          instanceof Error
          ? previewError.message
          : "Nie udało się otworzyć PDF"
      );
    } finally {
      setBusyId(null);
    }
  };

  const download = async (
    pdf: InstructionPdf
  ) => {
    setBusyId(pdf.id);
    setError("");

    try {
      const blob =
        await fetchPdfBlob(
          pdf,
          true
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const link =
        document.createElement(
          "a"
        );

      link.href = url;
      link.download =
        pdf.stored_filename;

      document.body.appendChild(
        link
      );

      link.click();
      link.remove();

      URL.revokeObjectURL(
        url
      );
    } catch (
      downloadError
    ) {
      setError(
        downloadError
          instanceof Error
          ? downloadError.message
          : "Nie udało się pobrać PDF"
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (
    pdf: InstructionPdf
  ) => {
    const confirmed =
      window.confirm(
        `Usunąć "${pdf.title}" v${pdf.version}?\n\nPlik PDF zostanie trwale usunięty z zamówienia i serwera.`
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

    setBusyId(pdf.id);
    setError("");

    try {
      const response =
        await fetch(
          `/api/order-instructions/${pdf.id}`,
          {
            method: "DELETE",
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
            "Nie udało się usunąć PDF"
          )
        );
      }

      setMessage(
        "Usunięto instrukcję PDF"
      );

      window.setTimeout(
        () => setMessage(""),
        2200
      );

      await load();
    } catch (
      removeError
    ) {
      setError(
        removeError
          instanceof Error
          ? removeError.message
          : "Nie udało się usunąć PDF"
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <section className="surface-card mt-5 overflow-hidden">
        <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="size-5 text-violet-300" />

              Instrukcje dla klienta
            </div>

            <div className="mt-1 text-xs text-white/35">
              Generuj, przechowuj i pobieraj instrukcje PDF przypisane do zamówienia.
            </div>
          </div>

          <button
            onClick={() => {
              setRegenerate(null);
              setModalOpen(true);
            }}
            className="secondary-button self-start sm:self-auto"
          >
            <Plus className="size-4" />
            Generuj PDF
          </button>
        </div>

        {loading ? (
          <div className="grid min-h-[160px] place-items-center">
            <LoaderCircle className="size-5 animate-spin text-white/25" />
          </div>
        ) : pdfs.length === 0 ? (
          <div className="grid min-h-[160px] place-items-center px-5 text-center">
            <div>
              <FileText className="mx-auto size-9 text-white/15" />

              <div className="mt-3 text-sm font-medium">
                Brak instrukcji
              </div>

              <div className="mt-1 text-xs text-white/35">
                Wygeneruj pierwszy dokument PDF dla tego zamówienia.
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[.055]">
            {pdfs.map(
              (pdf) => (
                <article
                  key={pdf.id}
                  className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"
                >
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-violet-400/15 bg-violet-400/[.055]">
                    <FileText className="size-5 text-violet-300" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white/90">
                        {pdf.title}
                      </div>

                      <span className="rounded-full border border-white/[.08] bg-white/[.03] px-2 py-1 text-[10px] text-white/45">
                        v{pdf.version}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-white/32">
                      {TYPE_LABELS[
                        pdf.instruction_type
                      ]}
                      {" · "}
                      {formatFileSize(
                        pdf.file_size
                      )}
                      {" · "}
                      {formatDate(
                        pdf.created_at
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        void preview(
                          pdf
                        )
                      }
                      disabled={
                        busyId
                        === pdf.id
                      }
                      className="secondary-button compact disabled:opacity-50"
                    >
                      <Eye className="size-4" />
                      Podgląd
                    </button>

                    <button
                      onClick={() =>
                        void download(
                          pdf
                        )
                      }
                      disabled={
                        busyId
                        === pdf.id
                      }
                      className="secondary-button compact disabled:opacity-50"
                    >
                      <Download className="size-4" />
                      Pobierz
                    </button>

                    <button
                      onClick={() => {
                        setRegenerate(
                          pdf
                        );
                        setModalOpen(
                          true
                        );
                      }}
                      className="secondary-button compact border-violet-400/20 text-violet-200"
                    >
                      <RefreshCw className="size-4" />
                      Nowa wersja
                    </button>

                    <button
                      onClick={() =>
                        void remove(
                          pdf
                        )
                      }
                      disabled={
                        busyId
                        === pdf.id
                      }
                      className="secondary-button compact border-red-400/20 text-red-200 hover:bg-red-400/[.06] disabled:opacity-50"
                    >
                      {busyId
                        === pdf.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}

                      Usuń
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

      {modalOpen && (
        <GenerateInstructionModal
          orderId={orderId}
          orderNumber={orderNumber}
          clientName={clientName}
          orderName={orderName}
          initial={regenerate}
          onClose={() => {
            setModalOpen(
              false
            );
            setRegenerate(
              null
            );
          }}
          onGenerated={(
            pdf
          ) => {
            setModalOpen(
              false
            );

            setRegenerate(
              null
            );

            setMessage(
              `Wygenerowano ${pdf.title} v${pdf.version}`
            );

            window.setTimeout(
              () =>
                setMessage(
                  ""
                ),
              2400
            );

            void load();
          }}
        />
      )}
    </>
  );
}
