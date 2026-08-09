"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Copy,
  History,
  LoaderCircle,
  MessageSquareText,
  PackageCheck,
  Plus,
  Save,
  Send,
  Trash2,
  Truck,
  UserRoundCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Workflow = {
  id: number;
  order_number: string;
  client_name: string;
  name: string;
  status: string;
  fulfillment_method:
    | "none"
    | "shipping"
    | "pickup";
  fulfillment_status:
    | "pending"
    | "ready"
    | "completed";
};

type Note = {
  id: number;
  content: string;
  author:
    | string
    | null;
  created_at: string;
};

type ChecklistItem = {
  id: number;
  title: string;
  is_done: boolean;
  sort_order: number;
};

type Activity = {
  id: number;
  event_type: string;
  title: string;
  details:
    | string
    | null;
  actor:
    | string
    | null;
  changes:
    | Record<
        string,
        {
          old: unknown;
          new: unknown;
        }
      >
    | null;
  created_at: string;
};

const METHOD_LABELS = {
  none: "Nieustalone",
  shipping: "Wysyłka",
  pickup: "Odbiór osobisty",
};

const STATUS_LABELS = {
  pending: "Niegotowe",
  ready: "Gotowe",
  completed: "Wydane / wysłane",
};

const FIELD_LABELS:
  Record<string, string> = {
    client_name: "klient",
    name: "nazwa",
    dimension: "wymiar",
    dimensions: "wymiar",
    quantity: "ilość",
    price: "cena",
    paid_amount: "wpłacono",
    payment_status:
      "płatność",
    status:
      "status produkcji",
    deadline:
      "termin",
    priority:
      "priorytet",
    production_bucket:
      "plan produkcji",
    fulfillment_method:
      "sposób przekazania",
    fulfillment_status:
      "status wydania",
    is_archived:
      "archiwum",
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

function formatDate(
  value: string
) {
  try {
    return new Intl.DateTimeFormat(
      "pl-PL",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

function changesSummary(
  changes:
    | Activity["changes"]
) {
  if (
    !changes
    || typeof changes
      !== "object"
  ) {
    return "";
  }

  const keys =
    Object.keys(
      changes
    );

  if (!keys.length) {
    return "";
  }

  return (
    "Zmieniono: "
    + keys
      .map(
        (key) =>
          FIELD_LABELS[
            key
          ] || key
      )
      .join(", ")
  );
}

export function OrderWorkflow({
  orderId,
}: {
  orderId: number;
}) {
  const router =
    useRouter();

  const [
    workflow,
    setWorkflow,
  ] = useState<
    Workflow | null
  >(null);

  const [
    notes,
    setNotes,
  ] = useState<Note[]>([]);

  const [
    checklist,
    setChecklist,
  ] = useState<
    ChecklistItem[]
  >([]);

  const [
    activity,
    setActivity,
  ] = useState<
    Activity[]
  >([]);

  const [
    method,
    setMethod,
  ] = useState<
    Workflow[
      "fulfillment_method"
    ]
  >("none");

  const [
    fulfillmentStatus,
    setFulfillmentStatus,
  ] = useState<
    Workflow[
      "fulfillment_status"
    ]
  >("pending");

  const [
    noteText,
    setNoteText,
  ] = useState("");

  const [
    checklistText,
    setChecklistText,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const headers = (
    json = false
  ) => {
    const token =
      localStorage.getItem(
        "yokai_token"
      );

    return {
      Authorization:
        `Bearer ${token || ""}`,
      ...(json
        ? {
            "Content-Type":
              "application/json",
          }
        : {}),
    };
  };

  const load =
    async () => {
      setLoading(true);
      setError("");

      try {
        const [
          workflowResponse,
          notesResponse,
          checklistResponse,
          activityResponse,
        ] =
          await Promise.all([
            fetch(
              `/api/orders/${orderId}/workflow`,
              {
                headers:
                  headers(),
                cache:
                  "no-store",
              }
            ),
            fetch(
              `/api/orders/${orderId}/internal-notes`,
              {
                headers:
                  headers(),
                cache:
                  "no-store",
              }
            ),
            fetch(
              `/api/orders/${orderId}/checklist`,
              {
                headers:
                  headers(),
                cache:
                  "no-store",
              }
            ),
            fetch(
              `/api/orders/${orderId}/activity?limit=80`,
              {
                headers:
                  headers(),
                cache:
                  "no-store",
              }
            ),
          ]);

        for (
          const response
          of [
            workflowResponse,
            notesResponse,
            checklistResponse,
            activityResponse,
          ]
        ) {
          if (
            !response.ok
          ) {
            throw new Error(
              await readError(
                response,
                "Nie udało się pobrać obsługi zamówienia"
              )
            );
          }
        }

        const nextWorkflow:
          Workflow =
          await workflowResponse.json();

        setWorkflow(
          nextWorkflow
        );

        setMethod(
          nextWorkflow
            .fulfillment_method
        );

        setFulfillmentStatus(
          nextWorkflow
            .fulfillment_status
        );

        setNotes(
          await notesResponse.json()
        );

        setChecklist(
          await checklistResponse.json()
        );

        setActivity(
          await activityResponse.json()
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

  const completed =
    useMemo(
      () =>
        checklist.filter(
          (item) =>
            item.is_done
        ).length,
      [checklist]
    );

  const percent =
    checklist.length
      ? Math.round(
          completed
          / checklist.length
          * 100
        )
      : 0;

  const flash = (
    value: string
  ) => {
    setMessage(value);

    window.setTimeout(
      () =>
        setMessage(
          ""
        ),
      2600
    );
  };

  const saveFulfillment =
    async () => {
      setBusy(
        "fulfillment"
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/fulfillment`,
            {
              method:
                "PATCH",
              headers:
                headers(
                  true
                ),
              body:
                JSON.stringify(
                  {
                    fulfillment_method:
                      method,
                    fulfillment_status:
                      fulfillmentStatus,
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
              "Nie udało się zapisać statusu wydania"
            )
          );
        }

        const next:
          Workflow =
          await response.json();

        setWorkflow(
          next
        );

        flash(
          "Status wydania zapisany"
        );

        await load();
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
        setBusy("");
      }
    };

  const duplicate =
    async () => {
      const confirmed =
        window.confirm(
          "Utworzyć nowe zamówienie jako kopię tego zlecenia?\n\nKlient, nazwa, wymiar, ilość, cena i notatki zostaną skopiowane. Płatność, termin i status produkcji zaczną od zera."
        );

      if (!confirmed) {
        return;
      }

      setBusy(
        "duplicate"
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/duplicate`,
            {
              method:
                "POST",
              headers:
                headers(),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się utworzyć kopii zamówienia"
            )
          );
        }

        const created =
          await response.json();

        router.push(
          `/orders/${created.id}`
        );
      } catch (
        duplicateError
      ) {
        setError(
          duplicateError
            instanceof Error
            ? duplicateError.message
            : "Nie udało się utworzyć kopii"
        );
      } finally {
        setBusy("");
      }
    };

  const addNote =
    async (
      event:
        React.FormEvent
    ) => {
      event.preventDefault();

      const content =
        noteText.trim();

      if (!content) {
        return;
      }

      setBusy(
        "note"
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/internal-notes`,
            {
              method:
                "POST",
              headers:
                headers(
                  true
                ),
              body:
                JSON.stringify(
                  {
                    content,
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
              "Nie udało się dodać notatki"
            )
          );
        }

        setNoteText("");

        flash(
          "Dodano notatkę"
        );

        await load();
      } catch (
        noteError
      ) {
        setError(
          noteError
            instanceof Error
            ? noteError.message
            : "Nie udało się dodać notatki"
        );
      } finally {
        setBusy("");
      }
    };

  const deleteNote =
    async (
      note: Note
    ) => {
      const confirmed =
        window.confirm(
          "Usunąć tę notatkę wewnętrzną?"
        );

      if (!confirmed) {
        return;
      }

      setBusy(
        `note-${note.id}`
      );

      try {
        const response =
          await fetch(
            `/api/order-internal-notes/${note.id}`,
            {
              method:
                "DELETE",
              headers:
                headers(),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się usunąć notatki"
            )
          );
        }

        flash(
          "Usunięto notatkę"
        );

        await load();
      } catch (
        removeError
      ) {
        setError(
          removeError
            instanceof Error
            ? removeError.message
            : "Nie udało się usunąć notatki"
        );
      } finally {
        setBusy("");
      }
    };

  const toggleChecklist =
    async (
      item:
        ChecklistItem
    ) => {
      setBusy(
        `check-${item.id}`
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/order-checklist/${item.id}`,
            {
              method:
                "PATCH",
              headers:
                headers(
                  true
                ),
              body:
                JSON.stringify(
                  {
                    is_done:
                      !item.is_done,
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
              "Nie udało się zmienić checklisty"
            )
          );
        }

        await load();
      } catch (
        checkError
      ) {
        setError(
          checkError
            instanceof Error
            ? checkError.message
            : "Nie udało się zmienić checklisty"
        );
      } finally {
        setBusy("");
      }
    };

  const addChecklist =
    async (
      event:
        React.FormEvent
    ) => {
      event.preventDefault();

      const title =
        checklistText.trim();

      if (!title) {
        return;
      }

      setBusy(
        "add-check"
      );
      setError("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/checklist`,
            {
              method:
                "POST",
              headers:
                headers(
                  true
                ),
              body:
                JSON.stringify(
                  {
                    title,
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
              "Nie udało się dodać zadania"
            )
          );
        }

        setChecklistText("");

        await load();
      } catch (
        addError
      ) {
        setError(
          addError
            instanceof Error
            ? addError.message
            : "Nie udało się dodać zadania"
        );
      } finally {
        setBusy("");
      }
    };

  const deleteChecklist =
    async (
      item:
        ChecklistItem
    ) => {
      const confirmed =
        window.confirm(
          `Usunąć zadanie "${item.title}"?`
        );

      if (!confirmed) {
        return;
      }

      setBusy(
        `delete-check-${item.id}`
      );

      try {
        const response =
          await fetch(
            `/api/order-checklist/${item.id}`,
            {
              method:
                "DELETE",
              headers:
                headers(),
            }
          );

        if (
          !response.ok
        ) {
          throw new Error(
            await readError(
              response,
              "Nie udało się usunąć zadania"
            )
          );
        }

        await load();
      } catch (
        removeError
      ) {
        setError(
          removeError
            instanceof Error
            ? removeError.message
            : "Nie udało się usunąć zadania"
        );
      } finally {
        setBusy("");
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
            <ClipboardCheck className="size-5 text-violet-300" />
            Obsługa zamówienia
          </div>

          <div className="mt-1 text-xs text-white/35">
            Ponowienie zamówienia, wydanie, checklista, notatki i historia zmian.
          </div>
        </div>

        <button
          onClick={() =>
            void duplicate()
          }
          disabled={
            busy
            === "duplicate"
          }
          className="secondary-button self-start border-violet-400/20 text-violet-200 disabled:opacity-50 sm:self-auto"
        >
          {busy
            === "duplicate" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Copy className="size-4" />
          )}

          Ponów zamówienie
        </button>
      </div>

      <div className="grid gap-5 border-b border-white/[.06] p-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <PackageCheck className="size-4 text-emerald-300" />
            Wydanie klientowi
          </div>

          <div className="mt-1 text-xs text-white/30">
            Osobny status od produkcji — możesz oznaczyć paczkę lub odbiór jako gotowy.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>
                Sposób
              </span>

              <select
                value={method}
                onChange={(
                  event
                ) =>
                  setMethod(
                    event.target
                      .value as Workflow[
                        "fulfillment_method"
                      ]
                  )
                }
              >
                {Object.entries(
                  METHOD_LABELS
                ).map(
                  ([
                    value,
                    label,
                  ]) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="field">
              <span>
                Status
              </span>

              <select
                value={
                  fulfillmentStatus
                }
                onChange={(
                  event
                ) =>
                  setFulfillmentStatus(
                    event.target
                      .value as Workflow[
                        "fulfillment_status"
                      ]
                  )
                }
              >
                {Object.entries(
                  STATUS_LABELS
                ).map(
                  ([
                    value,
                    label,
                  ]) => (
                    <option
                      key={
                        value
                      }
                      value={
                        value
                      }
                    >
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <button
            onClick={() =>
              void saveFulfillment()
            }
            disabled={
              busy
              === "fulfillment"
            }
            className="primary-button mt-3 disabled:opacity-50"
          >
            {busy
              === "fulfillment" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}

            Zapisz wydanie
          </button>

          {workflow
            ?.fulfillment_status
            === "ready" && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[.06] px-3 py-2 text-xs text-emerald-200">
              {workflow
                .fulfillment_method
                === "shipping" ? (
                <Truck className="size-4" />
              ) : (
                <UserRoundCheck className="size-4" />
              )}

              Gotowe do przekazania
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-4 text-violet-300" />
                Checklista produkcji
              </div>

              <div className="mt-1 text-xs text-white/30">
                {completed}
                {" / "}
                {checklist.length}
                {" wykonane"}
              </div>
            </div>

            <div className="text-lg font-semibold text-violet-200">
              {percent}%
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[.05]">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{
                width:
                  `${percent}%`,
              }}
            />
          </div>

          <div className="mt-4 space-y-1">
            {checklist.map(
              (item) => (
                <div
                  key={
                    item.id
                  }
                  className="group flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-white/[.025]"
                >
                  <button
                    onClick={() =>
                      void toggleChecklist(
                        item
                      )
                    }
                    disabled={
                      busy
                      === `check-${item.id}`
                    }
                    className="grid size-7 shrink-0 place-items-center rounded-lg"
                  >
                    {item.is_done ? (
                      <Check className="size-4 text-emerald-300" />
                    ) : (
                      <Circle className="size-4 text-white/20" />
                    )}
                  </button>

                  <button
                    onClick={() =>
                      void toggleChecklist(
                        item
                      )
                    }
                    className={`min-w-0 flex-1 text-left text-sm ${
                      item.is_done
                        ? "text-white/30 line-through"
                        : "text-white/75"
                    }`}
                  >
                    {item.title}
                  </button>

                  <button
                    onClick={() =>
                      void deleteChecklist(
                        item
                      )
                    }
                    className="grid size-7 place-items-center rounded-lg text-white/15 opacity-0 transition hover:bg-red-400/[.06] hover:text-red-200 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            )}
          </div>

          <form
            onSubmit={
              addChecklist
            }
            className="mt-3 flex gap-2"
          >
            <input
              value={
                checklistText
              }
              onChange={(
                event
              ) =>
                setChecklistText(
                  event.target.value
                )
              }
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/[.07] bg-white/[.025] px-3 text-sm outline-none focus:border-violet-400/40"
              placeholder="Dodaj własny etap..."
            />

            <button
              disabled={
                busy
                === "add-check"
                || !checklistText
                  .trim()
              }
              className="secondary-button compact disabled:opacity-40"
            >
              <Plus className="size-4" />
              Dodaj
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-5 border-b border-white/[.06] p-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <MessageSquareText className="size-4 text-cyan-300" />
            Notatki wewnętrzne
          </div>

          <div className="mt-1 text-xs text-white/30">
            Widoczne tylko w YOKAI OS.
          </div>

          <form
            onSubmit={
              addNote
            }
            className="mt-4"
          >
            <textarea
              value={
                noteText
              }
              onChange={(
                event
              ) =>
                setNoteText(
                  event.target.value
                )
              }
              rows={3}
              className="w-full rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-sm outline-none focus:border-violet-400/40"
              placeholder="np. Klient prosi o kontakt przed wysyłką..."
            />

            <button
              disabled={
                busy
                === "note"
                || !noteText
                  .trim()
              }
              className="primary-button mt-2 disabled:opacity-40"
            >
              {busy
                === "note" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}

              Dodaj notatkę
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {notes.length
              === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[.06] px-4 py-6 text-center text-xs text-white/25">
                Brak notatek
              </div>
            ) : (
              notes.map(
                (note) => (
                  <div
                    key={
                      note.id
                    }
                    className="group rounded-2xl border border-white/[.055] bg-white/[.018] p-3"
                  >
                    <div className="whitespace-pre-wrap text-sm text-white/70">
                      {note.content}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-white/25">
                      <span>
                        {note.author
                          || "YOKAI OS"}
                        {" · "}
                        {formatDate(
                          note.created_at
                        )}
                      </span>

                      <button
                        onClick={() =>
                          void deleteNote(
                            note
                          )
                        }
                        className="text-white/15 opacity-0 transition hover:text-red-200 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/[.06] bg-white/[.018] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <History className="size-4 text-amber-300" />
            Historia zmian
          </div>

          <div className="mt-1 text-xs text-white/30">
            Automatycznie zapisujemy ważne zmiany zamówienia oraz działania z tego modułu.
          </div>

          <div className="mt-4 max-h-[430px] space-y-3 overflow-y-auto pr-1">
            {activity.length
              === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[.06] px-4 py-6 text-center text-xs text-white/25">
                Historia zacznie się tworzyć od tej wersji YOKAI OS.
              </div>
            ) : (
              activity.map(
                (event) => {
                  const changeText =
                    changesSummary(
                      event.changes
                    );

                  return (
                    <div
                      key={
                        event.id
                      }
                      className="relative pl-5"
                    >
                      <div className="absolute left-0 top-1.5 size-2 rounded-full bg-violet-400/60" />

                      <div className="text-sm font-medium text-white/70">
                        {event.title}
                      </div>

                      {(event.details
                        || changeText) && (
                        <div className="mt-1 text-xs text-white/32">
                          {event.details
                            || changeText}
                        </div>
                      )}

                      <div className="mt-1 text-[10px] text-white/20">
                        {formatDate(
                          event.created_at
                        )}
                        {event.actor
                          ? ` · ${event.actor}`
                          : ""}
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>
        </div>
      </div>

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
