"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  CheckCircle2,
  Download,
  HardDrive,
  HeartPulse,
  LoaderCircle,
  Plus,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { ControlSuiteNav } from "../../components/control-suite-nav";

type Check = {
  name: string;
  status:
    | "ok"
    | "warning"
    | "error";
  detail: string;
};

type Backup = {
  name: string;
  size_bytes: number;
  created_at: string;
};

type Health = {
  overall: string;
  checks: Check[];
  backups: Backup[];
};

function size(
  value: number
) {
  const mb =
    value
    / 1024
    / 1024;

  return mb >= 1024
    ? `${(mb / 1024).toFixed(2)} GB`
    : `${mb.toFixed(1)} MB`;
}

function date(
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
      new Date(
        value
      )
    );
  } catch {
    return value;
  }
}

export default function SystemPage() {
  const [data, setData] =
    useState<Health | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);
  const [creating, setCreating] =
    useState(false);
  const [message, setMessage] =
    useState("");
  const [error, setError] =
    useState("");

  const load = useCallback(
    async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response =
          await fetch(
            "/api/system/health",
            {
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
              cache:
                "no-store",
            }
          );

        if (!response.ok) {
          throw new Error(
            "Nie udało się pobrać stanu systemu"
          );
        }

        setData(
          await response.json()
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const createBackup =
    async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        return;
      }

      setCreating(true);
      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            "/api/system/backups/create",
            {
              method:
                "POST",
              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );

        if (!response.ok) {
          const body =
            await response.json()
            .catch(
              () => ({})
            );

          throw new Error(
            body.detail
            || "Nie udało się utworzyć backupu"
          );
        }

        setMessage(
          "Backup utworzony"
        );

        await load();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setCreating(false);
      }
    };

  const download =
    async (
      backup: Backup
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
          `/api/system/backups/${encodeURIComponent(backup.name)}/download`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        setError(
          "Nie udało się pobrać backupu"
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
        backup.name;

      document.body.appendChild(
        link
      );
      link.click();
      link.remove();

      URL.revokeObjectURL(
        url
      );
    };

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-6 text-white lg:pl-[282px] lg:pr-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <HeartPulse className="size-4" />
              INFRASTRUKTURA
            </div>

            <h1 className="mt-2 text-3xl font-semibold">
              System i backup
            </h1>

            <div className="mt-2 text-sm text-white/35">
              Stan kluczowych usług oraz ręczne kopie bazy i plików YOKAI OS.
            </div>
          </div>

          <ControlSuiteNav
            active="/system"
          />
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[.05] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.05] px-4 py-3 text-sm text-emerald-200">
            {message}
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid min-h-[420px] place-items-center rounded-3xl border border-white/[.06] bg-white/[.02]">
            <LoaderCircle className="size-7 animate-spin text-white/20" />
          </div>
        ) : data ? (
          <>
            <section className="mt-6 rounded-3xl border border-white/[.06] bg-[#0e131a] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">
                    Stan usług
                  </div>
                  <div className="mt-1 text-xs text-white/30">
                    Kontrola bazy, kluczy API, dysku i katalogów danych.
                  </div>
                </div>

                <button
                  onClick={() =>
                    void load()
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.02] px-3 text-sm text-white/45"
                >
                  <RefreshCw className="size-4" />
                  Odśwież
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.checks.map(
                  (
                    item
                  ) => {
                    const Icon =
                      item.status === "ok"
                        ? CheckCircle2
                        : item.status === "warning"
                          ? TriangleAlert
                          : XCircle;

                    return (
                      <div
                        key={item.name}
                        className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`size-4 ${
                            item.status === "ok"
                              ? "text-emerald-300"
                              : item.status === "warning"
                                ? "text-amber-300"
                                : "text-red-300"
                          }`} />

                          <div className="text-sm font-semibold text-white/75">
                            {item.name}
                          </div>
                        </div>

                        <div className="mt-2 text-xs leading-5 text-white/30">
                          {item.detail}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
              <div className="flex flex-col justify-between gap-3 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <HardDrive className="size-4 text-violet-300" />
                    Backupy YOKAI OS
                  </div>
                  <div className="mt-1 text-xs text-white/30">
                    Backup zawiera dane tabel oraz pliki SVG, PDF i AI dostępne dla backendu.
                  </div>
                </div>

                <button
                  onClick={() =>
                    void createBackup()
                  }
                  disabled={creating}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-3 text-sm font-semibold disabled:opacity-50"
                >
                  {creating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}

                  Utwórz backup
                </button>
              </div>

              {data.backups.length === 0 ? (
                <div className="grid min-h-[180px] place-items-center text-sm text-white/25">
                  Brak backupów wykonanych z panelu.
                </div>
              ) : (
                <div className="divide-y divide-white/[.05]">
                  {data.backups.map(
                    (
                      backup
                    ) => (
                      <div
                        key={backup.name}
                        className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                      >
                        <div>
                          <div className="text-sm font-medium text-white/70">
                            {backup.name}
                          </div>

                          <div className="mt-1 text-xs text-white/25">
                            {date(
                              backup.created_at
                            )}
                            {" · "}
                            {size(
                              backup.size_bytes
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            void download(
                              backup
                            )
                          }
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.02] px-3 text-xs text-white/45"
                        >
                          <Download className="size-4" />
                          Pobierz
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
