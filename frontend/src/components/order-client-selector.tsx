"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  Building2,
  LoaderCircle,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Client = {
  id: number;
  client_number: string;
  client_type: "person" | "company";
  display_name: string;
  nip: string | null;
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

  const [clients, setClients] =
    useState<Client[]>([]);

  const [clientId, setClientId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  useEffect(() => {
    const token =
      localStorage.getItem("yokai_token");

    if (!token) return;

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
          throw new Error();
        }

        const data: Client[] =
          await response.json();

        setClients(data);

        const matched = data.find(
          (client) =>
            client.display_name
            === currentClientName
        );

        if (matched) {
          setClientId(
            String(matched.id)
          );
        }
      } catch {
        setError(
          "Nie udało się pobrać klientów"
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [currentClientName]);

  const assign = async () => {
    if (!clientId) {
      setError("Wybierz klienta");
      return;
    }

    const token =
      localStorage.getItem("yokai_token");

    if (!token) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/orders/${orderId}/assign-client`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: Number(clientId),
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

      setMessage("Klient przypisany");

      window.setTimeout(() => {
        window.location.reload();
      }, 500);
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
    <section className="surface-card mt-5 overflow-hidden">
      <div className="flex flex-col justify-between gap-4 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Users className="size-5 text-violet-300" />
            Klient
          </div>

          <div className="mt-1 text-xs text-white/35">
            Powiąż zamówienie z kartą klienta.
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
        {loading ? (
          <LoaderCircle className="size-5 animate-spin text-white/25" />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="field flex-1">
              <span>Wybierz klienta</span>

              <select
                value={clientId}
                onChange={(event) =>
                  setClientId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Wybierz z bazy
                </option>

                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {client.client_type === "company"
                      ? "Firma"
                      : "Osoba"}
                    {" · "}
                    {client.display_name}
                    {client.nip
                      ? ` · NIP ${client.nip}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={() =>
                void assign()
              }
              disabled={
                saving
                || !clientId
              }
              className="primary-button self-end justify-center disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                clientId
                  && clients.find(
                    (client) =>
                      String(client.id)
                      === clientId
                  )?.client_type
                    === "company"
                  ? (
                    <Building2 className="size-4" />
                  )
                  : (
                    <UserRound className="size-4" />
                  )
              )}

              Przypisz klienta
            </button>
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
