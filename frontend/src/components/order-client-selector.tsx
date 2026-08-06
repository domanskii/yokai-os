"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Building2,
  Check,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Client = {
  id: number;
  client_number: string;
  client_type: "person" | "company";
  display_name: string;
  nip: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
};

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

export function OrderClientSelector({
  orderId,
  currentClientName,
}: {
  orderId: number;
  currentClientName: string;
}) {
  const router = useRouter();

  const [query, setQuery] =
    useState(currentClientName || "");

  const [clients, setClients] =
    useState<Client[]>([]);

  const [selected, setSelected] =
    useState<Client | null>(null);

  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const wrapperRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOutside = (
      event: MouseEvent
    ) => {
      if (
        !wrapperRef.current?.contains(
          event.target as Node
        )
      ) {
        setOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      closeOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        closeOutside
      );
    };
  }, []);

  useEffect(() => {
    const token =
      localStorage.getItem("yokai_token");

    if (!token) return;

    const timeout = window.setTimeout(
      async () => {
        setLoading(true);
        setError("");

        try {
          const params =
            new URLSearchParams({
              archived: "false",
              limit: "50",
            });

          if (query.trim()) {
            params.set(
              "search",
              query.trim()
            );
          }

          const response = await fetch(
            `/api/clients?${params.toString()}`,
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
                "Nie udało się pobrać klientów"
              )
            );
          }

          const data: Client[] =
            await response.json();

          setClients(data);

          if (!selected) {
            const exact = data.find(
              (client) =>
                client.display_name
                  .toLocaleLowerCase("pl")
                === (
                  currentClientName || ""
                )
                  .trim()
                  .toLocaleLowerCase("pl")
            );

            if (exact) {
              setSelected(exact);
            }
          }
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Nie udało się pobrać klientów"
          );
        } finally {
          setLoading(false);
        }
      },
      220
    );

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    query,
    currentClientName,
    selected,
  ]);

  const chooseClient = (
    client: Client
  ) => {
    setSelected(client);
    setQuery(client.display_name);
    setOpen(false);
    setError("");
    setMessage("");
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery("");
    setOpen(true);
    setMessage("");
  };

  const assign = async () => {
    if (!selected) {
      setError(
        "Najpierw wyszukaj i wybierz klienta"
      );
      return;
    }

    const token =
      localStorage.getItem("yokai_token");

    if (!token) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/orders/${orderId}/assign-client`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            client_id: selected.id,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Nie udało się przypisać klienta"
          )
        );
      }

      setMessage(
        `Przypisano ${selected.display_name}`
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 550);
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Nie udało się przypisać klienta"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface-card mt-5 overflow-visible">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Users className="size-5 text-violet-300" />
            Klient
          </div>

          <div className="mt-1 text-xs text-white/35">
            Wyszukaj klienta po nazwie, NIP-ie, telefonie lub e-mailu.
          </div>
        </div>

        <button
          onClick={() =>
            router.push("/clients?new=1")
          }
          className="secondary-button self-start sm:self-auto"
        >
          <Plus className="size-4" />
          Nowy klient
        </button>
      </div>

      <div className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div
            ref={wrapperRef}
            className="relative flex-1"
          >
            <label className="field">
              <span>Wyszukaj klienta</span>

              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/30" />

                <input
                  value={query}
                  onFocus={() =>
                    setOpen(true)
                  }
                  onChange={(event) => {
                    setQuery(
                      event.target.value
                    );

                    setSelected(null);
                    setOpen(true);
                    setMessage("");
                  }}
                  className="pl-11 pr-11"
                  placeholder="Zacznij wpisywać nazwę, NIP, telefon..."
                  autoComplete="off"
                />

                {query && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-white/35 transition hover:bg-white/[.06] hover:text-white/70"
                    aria-label="Wyczyść"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </label>

            {open && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100] overflow-hidden rounded-2xl border border-white/[.1] bg-[#10141b] shadow-[0_25px_80px_rgba(0,0,0,.65)]">
                {loading ? (
                  <div className="grid min-h-24 place-items-center">
                    <LoaderCircle className="size-5 animate-spin text-white/25" />
                  </div>
                ) : clients.length === 0 ? (
                  <div className="px-4 py-5 text-sm text-white/35">
                    Brak pasujących klientów.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto p-2">
                    {clients.map(
                      (client) => (
                        <button
                          key={client.id}
                          type="button"
                          onClick={() =>
                            chooseClient(
                              client
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[.055]"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.07] bg-white/[.03]">
                            {client.client_type
                              === "company" ? (
                              <Building2 className="size-4 text-cyan-300" />
                            ) : (
                              <UserRound className="size-4 text-violet-300" />
                            )}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-white/90">
                              {client.display_name}
                            </span>

                            <span className="mt-1 block truncate text-[11px] text-white/30">
                              {client.client_number}
                              {client.nip
                                ? ` · NIP ${client.nip}`
                                : ""}
                              {client.phone
                                ? ` · ${client.phone}`
                                : ""}
                              {client.email
                                ? ` · ${client.email}`
                                : ""}
                            </span>
                          </span>

                          {selected?.id
                            === client.id && (
                            <Check className="size-4 shrink-0 text-emerald-300" />
                          )}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() =>
              void assign()
            }
            disabled={
              saving || !selected
            }
            className="primary-button min-w-[190px] justify-center disabled:opacity-45"
          >
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : selected?.client_type
              === "company" ? (
              <Building2 className="size-4" />
            ) : (
              <UserRound className="size-4" />
            )}

            Przypisz klienta
          </button>
        </div>

        {selected && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/35">
            <span>
              Wybrano:
            </span>

            <span className="rounded-full border border-violet-400/20 bg-violet-400/[.06] px-2.5 py-1 text-violet-200">
              {selected.display_name}
            </span>

            {selected.nip && (
              <span>
                NIP {selected.nip}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-3 text-sm text-emerald-200">
            {message}
          </div>
        )}
      </div>
    </section>
  );
}
