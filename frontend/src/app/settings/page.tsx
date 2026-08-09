"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  LoaderCircle,
  Save,
  Settings,
} from "lucide-react";
import { ControlSuiteNav } from "../../components/control-suite-nav";

type SettingsData = {
  values: Record<
    string,
    string | number | boolean
  >;
};

const FIELDS = [
  {
    key: "labor_hourly_cost",
    label: "Koszt godziny pracy",
    suffix: "zł/h",
    type: "number",
    step: "0.01",
  },
  {
    key: "shipping_cost",
    label: "Koszt wysyłki",
    suffix: "zł",
    type: "number",
    step: "0.01",
  },
  {
    key: "free_shipping_threshold",
    label: "Darmowa wysyłka od",
    suffix: "zł",
    type: "number",
    step: "0.01",
  },
  {
    key: "default_margin_percent",
    label: "Domyślna marża",
    suffix: "%",
    type: "number",
    step: "0.1",
  },
  {
    key: "woo_sync_interval_seconds",
    label: "Synchronizacja WooCommerce",
    suffix: "sek.",
    type: "number",
    step: "1",
  },
  {
    key: "low_stock_days",
    label: "Alert prognozy zapasu",
    suffix: "dni",
    type: "number",
    step: "1",
  },
  {
    key: "backup_retention",
    label: "Liczba backupów do zachowania",
    suffix: "szt.",
    type: "number",
    step: "1",
  },
  {
    key: "report_default_days",
    label: "Domyślny zakres raportów",
    suffix: "dni",
    type: "number",
    step: "1",
  },
];

async function readError(
  response: Response
) {
  try {
    const data =
      await response.json();

    return (
      data.detail
      || "Nie udało się wykonać operacji"
    );
  } catch {
    return "Nie udało się wykonać operacji";
  }
}

export default function SettingsPage() {
  const [values, setValues] =
    useState<
      Record<string, any>
    >({});
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
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

      try {
        const response =
          await fetch(
            "/api/settings",
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
            await readError(
              response
            )
          );
        }

        const data:
          SettingsData =
          await response.json();

        setValues(
          data.values || {}
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

  const save =
    async () => {
      const token =
        localStorage.getItem(
          "yokai_token"
        );

      if (!token) {
        return;
      }

      setSaving(true);
      setError("");
      setMessage("");

      try {
        const response =
          await fetch(
            "/api/settings",
            {
              method: "PATCH",
              headers: {
                Authorization:
                  `Bearer ${token}`,
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  values,
                }),
            }
          );

        if (!response.ok) {
          throw new Error(
            await readError(
              response
            )
          );
        }

        const data =
          await response.json();

        setValues(
          data.values || values
        );

        setMessage(
          "Ustawienia zapisane"
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setSaving(false);
      }
    };

  return (
    <main className="min-h-screen bg-[#080b10] px-4 py-6 text-white lg:pl-[282px] lg:pr-8">
      <div className="mx-auto max-w-[1450px]">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300/70">
              <Settings className="size-4" />
              YOKAI CONTROL SUITE
            </div>

            <h1 className="mt-2 text-3xl font-semibold">
              Ustawienia
            </h1>

            <div className="mt-2 text-sm text-white/35">
              Wspólne parametry biznesowe używane przez kolejne moduły YOKAI OS.
            </div>
          </div>

          <ControlSuiteNav
            active="/settings"
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
          <div className="mt-6 grid min-h-[400px] place-items-center rounded-3xl border border-white/[.06] bg-white/[.02]">
            <LoaderCircle className="size-7 animate-spin text-white/20" />
          </div>
        ) : (
          <section className="mt-6 overflow-hidden rounded-3xl border border-white/[.06] bg-[#0e131a]">
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {FIELDS.map(
                (field) => (
                  <label
                    key={field.key}
                    className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4"
                  >
                    <div className="text-xs font-medium text-white/55">
                      {field.label}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type={field.type}
                        step={field.step}
                        value={
                          values[
                            field.key
                          ] ?? ""
                        }
                        onChange={(e) =>
                          setValues(
                            (
                              current
                            ) => ({
                              ...current,
                              [field.key]:
                                Number(
                                  e.target.value
                                ),
                            })
                          )
                        }
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm outline-none focus:border-violet-400/35"
                      />

                      <span className="shrink-0 text-xs text-white/25">
                        {field.suffix}
                      </span>
                    </div>
                  </label>
                )
              )}

              <label className="rounded-2xl border border-white/[.06] bg-white/[.018] p-4">
                <div className="text-xs font-medium text-white/55">
                  Domyślna jakość AI
                </div>

                <select
                  value={
                    String(
                      values
                        .ai_default_quality
                      || "low"
                    )
                  }
                  onChange={(e) =>
                    setValues(
                      (
                        current
                      ) => ({
                        ...current,
                        ai_default_quality:
                          e.target.value,
                      })
                    )
                  }
                  className="mt-3 h-11 w-full rounded-xl border border-white/[.08] bg-black/20 px-3 text-sm outline-none focus:border-violet-400/35"
                >
                  <option value="low">
                    Low
                  </option>
                  <option value="medium">
                    Medium
                  </option>
                  <option value="high">
                    High
                  </option>
                </select>
              </label>
            </div>

            <div className="flex justify-end border-t border-white/[.06] p-5">
              <button
                onClick={() =>
                  void save()
                }
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}

                Zapisz ustawienia
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
