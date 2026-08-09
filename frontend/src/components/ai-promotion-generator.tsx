"use client";

import {
  Copy,
  LoaderCircle,
  Megaphone,
  RefreshCw,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

type Promotion = {
  platform: string;
  format: string;
  audience: string;
  placements: string[];
  hook: string;
  idea: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

async function errorText(
  response: Response
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
  }

  return (
    "Nie udało się "
    + "wygenerować promocji"
  );
}

async function copyText(
  value: string
) {
  await navigator.clipboard.writeText(
    value
  );
}

function CopyButton({
  value,
}: {
  value: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(value)
      }
      className="inline-flex items-center gap-1 text-[10px] text-violet-200/70"
    >
      <Copy className="size-3" />
      Kopiuj
    </button>
  );
}

export function PromotionGenerator({
  versionId,
}: {
  versionId: number;
}) {
  const [
    platform,
    setPlatform,
  ] =
    useState("auto");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    result,
    setResult,
  ] =
    useState<
      Promotion | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState("");

  const tags =
    useMemo(
      () =>
        (
          result?.hashtags
          || []
        ).join(" "),
      [result]
    );

  const placements =
    useMemo(
      () =>
        (
          result?.placements
          || []
        ).join(" • "),
      [result]
    );

  const allText =
    useMemo(
      () => {
        if (!result) {
          return "";
        }

        return [
          `PLATFORMA: ${result.platform}`,
          `FORMAT: ${result.format}`,
          `DLA KOGO: ${result.audience}`,
          `GDZIE PRZYKLEIĆ: ${placements}`,
          `HOOK: ${result.hook}`,
          `POMYSŁ: ${result.idea}`,
          `OPIS: ${result.caption}`,
          `CTA: ${result.cta}`,
          `TAGI: ${tags}`,
        ].join("\n");
      },
      [
        result,
        tags,
        placements,
      ]
    );

  const generate =
    async () => {
      setLoading(true);
      setError("");

      try {
        const response =
          await fetch(
            `/api/ai-project-versions/${versionId}/promotion`,
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${
                    localStorage.getItem(
                      "yokai_token"
                    ) || ""
                  }`,
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  platform,
                }),
            }
          );

        if (!response.ok) {
          throw new Error(
            await errorText(
              response
            )
          );
        }

        setResult(
          await response.json()
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Błąd"
        );
      } finally {
        setLoading(false);
      }
    };

  return (
    <div className="w-full rounded-2xl border border-violet-400/10 bg-violet-500/[.025] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={platform}
          onChange={event =>
            setPlatform(
              event.target.value
            )
          }
          className="h-9 rounded-xl border border-white/[.08] bg-black/20 px-3 text-xs text-white outline-none"
        >
          <option value="auto">
            AUTO
          </option>
          <option value="tiktok">
            TikTok
          </option>
          <option value="instagram">
            Instagram
          </option>
          <option value="facebook">
            Facebook
          </option>
        </select>

        <button
          type="button"
          onClick={() =>
            void generate()
          }
          disabled={loading}
          className="secondary-button compact border-violet-400/15 text-violet-100 disabled:opacity-40"
        >
          {loading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : result ? (
            <RefreshCw className="size-4" />
          ) : (
            <Megaphone className="size-4" />
          )}

          {result
            ? "Generuj ponownie"
            : "Wygeneruj promocję"}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 space-y-4 border-t border-white/[.05] pt-3 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/25">
                Platforma
              </div>
              <div className="mt-1 font-medium">
                {result.platform}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/25">
                Format
              </div>
              <div className="mt-1 font-medium">
                {result.format}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              Dla kogo
            </div>
            <div className="mt-1 leading-5 text-white/75">
              {result.audience}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              Gdzie przykleić
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {result.placements.map(
                item => (
                  <span
                    key={item}
                    className="rounded-lg border border-white/[.06] bg-white/[.025] px-2 py-1 text-white/65"
                  >
                    {item}
                  </span>
                )
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              Hook
            </div>
            <div className="mt-1 leading-5 text-white/75">
              {result.hook}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              Pomysł na publikację
            </div>
            <div className="mt-1 leading-5 text-white/75">
              {result.idea}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider text-white/25">
                Opis
              </div>

              <CopyButton
                value={
                  result.caption
                }
              />
            </div>

            <div className="mt-1 whitespace-pre-line leading-5 text-white/75">
              {result.caption}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/25">
              CTA
            </div>
            <div className="mt-1 leading-5 text-white/75">
              {result.cta}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wider text-white/25">
                Tagi
              </div>

              <CopyButton
                value={tags}
              />
            </div>

            <div className="mt-1 break-words leading-5 text-white/60">
              {tags}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void copyText(
                allText
              )
            }
            className="secondary-button compact w-full justify-center"
          >
            <Copy className="size-4" />
            Kopiuj wszystko
          </button>
        </div>
      )}
    </div>
  );
}
