"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Building2,
  LoaderCircle,
  Search,
  UserRound,
} from "lucide-react";

type Client = {
  id: number;
  client_number: string;
  client_type: "person" | "company";
  display_name: string;
  nip: string | null;
  email: string | null;
  phone: string | null;
};

export function ManualOrderClientSearch({
  inputId,
}: {
  inputId: string;
}) {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [query, setQuery] =
    useState("");

  const [open, setOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const dropdownRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const token =
      localStorage.getItem("yokai_token");

    if (!token) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(
          "/api/clients?archived=false&limit=1000",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        setClients(
          await response.json()
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const input =
      document.getElementById(
        inputId
      ) as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const sync = () => {
      setQuery(input.value);
    };

    const focus = () => {
      sync();
      setOpen(true);
    };

    const outsideClick = (
      event: MouseEvent
    ) => {
      const target =
        event.target as Node;

      if (
        target === input
        || dropdownRef.current?.contains(
          target
        )
      ) {
        return;
      }

      setOpen(false);
    };

    input.addEventListener(
      "input",
      sync
    );

    input.addEventListener(
      "focus",
      focus
    );

    document.addEventListener(
      "mousedown",
      outsideClick
    );

    sync();

    return () => {
      input.removeEventListener(
        "input",
        sync
      );

      input.removeEventListener(
        "focus",
        focus
      );

      document.removeEventListener(
        "mousedown",
        outsideClick
      );
    };
  }, [inputId]);

  const visible = useMemo(() => {
    const phrase =
      query.trim().toLocaleLowerCase("pl");

    return clients
      .filter((client) => {
        if (!phrase) {
          return true;
        }

        return [
          client.display_name,
          client.client_number,
          client.nip || "",
          client.email || "",
          client.phone || "",
        ]
          .join(" ")
          .toLocaleLowerCase("pl")
          .includes(phrase);
      })
      .slice(0, 8);
  }, [clients, query]);

  const selectClient = (
    client: Client
  ) => {
    const input =
      document.getElementById(
        inputId
      ) as HTMLInputElement | null;

    if (!input) {
      return;
    }

    const setter =
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;

    setter?.call(
      input,
      client.display_name
    );

    input.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true,
        }
      )
    );

    input.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true,
        }
      )
    );

    setQuery(
      client.display_name
    );

    setOpen(false);
  };

  if (!open) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute left-0 right-0 top-[calc(100%+8px)] z-[95] overflow-hidden rounded-2xl border border-white/[.09] bg-[#10141b] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-white/[.06] px-4 py-3 text-xs text-white/35">
        <Search className="size-3.5" />
        Wyszukaj w bazie klientów
      </div>

      {loading ? (
        <div className="grid min-h-24 place-items-center">
          <LoaderCircle className="size-5 animate-spin text-white/25" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-5 text-sm text-white/35">
          Brak pasującego klienta. Możesz wpisać nazwę ręcznie.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto p-2">
          {visible.map((client) => (
            <button
              key={client.id}
              type="button"
              onMouseDown={(
                event
              ) => {
                event.preventDefault();
                selectClient(client);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[.055]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[.07] bg-white/[.03]">
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
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
