"use client";

import { YokaiSidebar } from "../../components/yokai-sidebar";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { PromotionGenerator } from "../../components/ai-promotion-generator";
import {
  Bot,
  Boxes,
  Check,
  CircleDollarSign,
  Download,
  FileImage,
  Gauge,
  ImageIcon,
  LoaderCircle,
  Menu,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

type Project = {
  id: number;
  project_number: string;
  order_id: number | null;
  name: string;
  project_type: string;
  brief: string;
  color_count: number;
  text_content: string | null;
  notes: string | null;
  status: string;
  order_number?: string | null;
  client_name?: string | null;
  versions_count?: number;
  references?: Ref[];
  versions?: Version[];
  generated_prompt?: string;
};

type Ref = {
  id: number;
  original_filename: string;
};

type Version = {
  id: number;
  version: number;
  version_type: "ai" | "svg";
  model: string | null;
  quality: string | null;
  size: string | null;
  original_filename: string | null;
  is_approved: boolean;
  svg_asset_id: number | null;
  created_at: string;
};

type AIStatus = {
  configured: boolean;
  provider: string;
  model: string;
};

const nav = [
  ["Dashboard", "/", Gauge],
  ["Produkcja", "/production", Zap],
  ["Zamówienia", "/orders", ShoppingBag],
  ["Biblioteka SVG", "/library", FileImage],
  ["Kalkulator", "/calculator", CircleDollarSign],
  ["Materiały", "/materials", Boxes],
  ["Klienci", "/clients", Users],
  ["Finanse", "/finance", CircleDollarSign],
  ["AI Studio", "/ai-studio", Bot],
] as const;

async function errText(
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

function auth(
  json = false
) {
  return {
    Authorization:
      `Bearer ${localStorage.getItem("yokai_token") || ""}`,
    ...(json
      ? {
          "Content-Type":
            "application/json",
        }
      : {}),
  };
}

function AuthImage({
  url,
}: {
  url: string;
}) {
  const [src, setSrc] =
    useState("");

  useEffect(() => {
    let objectUrl = "";
    let active = true;

    void (async () => {
      try {
        const response = await fetch(
          url,
          {
            headers: auth(),
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        objectUrl =
          URL.createObjectURL(
            await response.blob()
          );

        if (active) {
          setSrc(objectUrl);
        }
      } catch {}
    })();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [url]);

  return src ? (
    <img
      src={src}
      alt=""
      className="aspect-square w-full object-contain p-3"
    />
  ) : (
    <div className="grid aspect-square place-items-center">
      <LoaderCircle className="size-5 animate-spin text-white/15" />
    </div>
  );
}

function Sidebar({
  close,
}: {
  close?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <div className="text-xs font-semibold uppercase tracking-[.25em] text-violet-300/70">
          YOKAI
        </div>
        <div className="mt-1 text-xl font-semibold">
          OS
        </div>
      </div>

      <nav className="space-y-1 px-3">
        {nav.map(
          ([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                href === "/ai-studio"
                  ? "bg-violet-500/12 text-violet-100"
                  : "text-white/45 hover:bg-white/[.035] hover:text-white/80"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}

export default function AIStudioPage() {
  const [projects, setProjects] =
    useState<Project[]>([]);
  const [selected, setSelected] =
    useState<Project | null>(null);
  const [status, setStatus] =
    useState<AIStatus | null>(null);
  const [search, setSearch] =
    useState("");
  const [loading, setLoading] =
    useState(true);
  const [mobile, setMobile] =
    useState(false);
  const [creating, setCreating] =
    useState(false);
  const [generating, setGenerating] =
    useState(false);
  const [uploading, setUploading] =
    useState(false);
  const [busyVersion, setBusyVersion] =
    useState<number | null>(null);
  const [error, setError] =
    useState("");
  const [message, setMessage] =
    useState("");

  const [name, setName] =
    useState("");
  const [projectType, setProjectType] =
    useState("graphic");
  const [brief, setBrief] =
    useState("");
  const [colors, setColors] =
    useState(2);
  const [textValue, setTextValue] =
    useState("");
  const [notes, setNotes] =
    useState("");
  const [orderId, setOrderId] =
    useState("");
  const [revision, setRevision] =
    useState("");
  const [quality, setQuality] =
    useState("low");
  const [size, setSize] =
    useState("1024x1024");

  const flash = (
    text: string
  ) => {
    setMessage(text);

    window.setTimeout(
      () => setMessage(""),
      2600
    );
  };

  const loadList = useCallback(
    async (
      phrase = ""
    ) => {
      const [
        statusResponse,
        projectsResponse,
      ] = await Promise.all([
        fetch(
          "/api/ai-studio/status",
          {
            headers: auth(),
            cache: "no-store",
          }
        ),
        fetch(
          `/api/ai-projects?limit=150${
            phrase.trim()
              ? `&search=${encodeURIComponent(phrase.trim())}`
              : ""
          }`,
          {
            headers: auth(),
            cache: "no-store",
          }
        ),
      ]);

      if (
        !statusResponse.ok
        || !projectsResponse.ok
      ) {
        throw new Error(
          "Nie udało się pobrać AI Studio"
        );
      }

      setStatus(
        await statusResponse.json()
      );
      setProjects(
        await projectsResponse.json()
      );
    },
    []
  );

  const openProject = useCallback(
    async (
      projectId: number
    ) => {
      setError("");

      try {
        const response = await fetch(
          `/api/ai-projects/${projectId}`,
          {
            headers: auth(),
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            await errText(
              response,
              "Nie udało się otworzyć projektu"
            )
          );
        }

        const project:
          Project =
          await response.json();

        setSelected(project);
        setName(project.name);
        setProjectType(
          project.project_type
        );
        setBrief(project.brief);
        setColors(
          project.color_count
        );
        setTextValue(
          project.text_content || ""
        );
        setNotes(
          project.notes || ""
        );
        setOrderId(
          project.order_id
            ? String(project.order_id)
            : ""
        );

        window.history.replaceState(
          {},
          "",
          `/ai-studio?project=${projectId}`
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      }
    },
    []
  );

  useEffect(() => {
    void (async () => {
      try {
        await loadList();

        const params =
          new URLSearchParams(
            window.location.search
          );

        const p = Number(
          params.get("project")
        );

        const o = Number(
          params.get("order")
        );

        const createNew =
          params.get("new")
          === "1";

        if (createNew) {
          setSelected(null);
          setName("");
          setProjectType("graphic");
          setBrief("");
          setColors(2);
          setTextValue("");
          setNotes("");
          setOrderId("");
          setCreating(true);
        }

        if (
          Number.isFinite(o)
          && o > 0
        ) {
          setCreating(true);
          setOrderId(String(o));
        }

        if (
          Number.isFinite(p)
          && p > 0
        ) {
          await openProject(p);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [
    loadList,
    openProject,
  ]);

  useEffect(() => {
    const timer =
      window.setTimeout(
        () =>
          void loadList(search)
            .catch(() => {}),
        250
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [
    search,
    loadList,
  ]);

  const saveProject =
    async () => {
      setError("");

      const payload = {
        name:
          name.trim(),
        project_type:
          projectType,
        brief:
          brief.trim(),
        color_count:
          colors,
        text_content:
          textValue.trim()
          || null,
        notes:
          notes.trim()
          || null,
        order_id:
          orderId
            ? Number(orderId)
            : null,
      };

      const response = await fetch(
        selected
          ? `/api/ai-projects/${selected.id}`
          : "/api/ai-projects",
        {
          method:
            selected
              ? "PATCH"
              : "POST",
          headers: auth(true),
          body:
            JSON.stringify(
              payload
            ),
        }
      );

      if (!response.ok) {
        throw new Error(
          await errText(
            response,
            "Nie udało się zapisać projektu"
          )
        );
      }

      const result =
        await response.json();

      setCreating(false);
      await loadList(search);
      await openProject(
        result.id
      );
      flash(
        selected
          ? "Projekt zapisany"
          : "Projekt utworzony"
      );
    };

  const uploadRef =
    async (
      file: File
    ) => {
      if (!selected) {
        return;
      }

      setUploading(true);

      try {
        const form =
          new FormData();

        form.append(
          "file",
          file
        );

        const response = await fetch(
          `/api/ai-projects/${selected.id}/references`,
          {
            method: "POST",
            headers: auth(),
            body: form,
          }
        );

        if (!response.ok) {
          throw new Error(
            await errText(
              response,
              "Nie udało się dodać referencji"
            )
          );
        }

        await openProject(
          selected.id
        );
        flash(
          "Dodano referencję"
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setUploading(false);
      }
    };

  const generate =
    async () => {
      if (!selected) {
        return;
      }

      setGenerating(true);
      setError("");

      try {
        const response = await fetch(
          `/api/ai-projects/${selected.id}/generate`,
          {
            method: "POST",
            headers: auth(true),
            body:
              JSON.stringify({
                revision:
                  revision.trim()
                  || null,
                quality,
                size,
              }),
          }
        );

        if (!response.ok) {
          throw new Error(
            await errText(
              response,
              "Nie udało się wygenerować projektu"
            )
          );
        }

        setRevision("");
        await openProject(
          selected.id
        );
        await loadList(search);
        flash(
          "Wygenerowano nową wersję"
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setGenerating(false);
      }
    };

  const uploadSvg =
    async (
      file: File
    ) => {
      if (!selected) {
        return;
      }

      setUploading(true);

      try {
        const form =
          new FormData();

        form.append(
          "file",
          file
        );

        const response = await fetch(
          `/api/ai-projects/${selected.id}/svg-version`,
          {
            method: "POST",
            headers: auth(),
            body: form,
          }
        );

        if (!response.ok) {
          throw new Error(
            await errText(
              response,
              "Nie udało się dodać SVG"
            )
          );
        }

        await openProject(
          selected.id
        );
        flash(
          "Dodano produkcyjny SVG"
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setUploading(false);
      }
    };

  const versionAction =
    async (
      version: Version,
      action:
        | "approve"
        | "library"
        | "delete"
    ) => {
      if (
        action === "delete"
        && !window.confirm(
          `Usunąć v${version.version}?`
        )
      ) {
        return;
      }

      setBusyVersion(
        version.id
      );

      try {
        const suffix =
          action === "approve"
            ? "/approve"
            : action === "library"
              ? "/send-to-library"
              : "";

        const response = await fetch(
          `/api/ai-project-versions/${version.id}${suffix}`,
          {
            method:
              action === "delete"
                ? "DELETE"
                : "POST",
            headers: auth(),
          }
        );

        if (!response.ok) {
          throw new Error(
            await errText(
              response,
              "Operacja nie powiodła się"
            )
          );
        }

        const result =
          await response.json();

        await openProject(
          selected!.id
        );

        flash(
          result.message
          || "Gotowe"
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Błąd"
        );
      } finally {
        setBusyVersion(null);
      }
    };

  const download =
    async (
      version: Version
    ) => {
      const response = await fetch(
        `/api/ai-project-versions/${version.id}/file?download=true`,
        {
          headers: auth(),
        }
      );

      if (!response.ok) {
        setError(
          await errText(
            response,
            "Nie udało się pobrać"
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
        version.original_filename
        || (
          version.version_type === "svg"
            ? `v${version.version}.svg`
            : `v${version.version}.png`
        );

      document.body.appendChild(
        link
      );
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    };

  const resetForm =
    () => {
      setSelected(null);
      setName("");
      setProjectType("graphic");
      setBrief("");
      setColors(2);
      setTextValue("");
      setNotes("");
      setOrderId("");
      setCreating(true);
      window.history.replaceState(
        {},
        "",
        "/ai-studio"
      );
    };

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      <YokaiSidebar />

      {mobile && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            className="absolute inset-0 bg-black/75"
            onClick={() =>
              setMobile(false)
            }
          />
          <aside className="relative h-full w-[280px] bg-[#0b0f15]">
            <button
              className="absolute right-4 top-4"
              onClick={() =>
                setMobile(false)
              }
            >
              <X className="size-5" />
            </button>
            <Sidebar
              close={() =>
                setMobile(false)
              }
            />
          </aside>
        </div>
      )}

      <main className="min-h-screen lg:pl-[250px]">
        <div className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex gap-4">
            <button
              className="icon-button mt-1 lg:hidden"
              onClick={() =>
                setMobile(true)
              }
            >
              <Menu className="size-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-violet-300/70">
                    <Bot className="size-4" />
                    YOKAI DESIGN ENGINE
                  </div>
                  <h1 className="mt-2 text-4xl font-semibold">
                    AI Studio
                  </h1>
                  <div className="mt-2 text-sm text-white/35">
                    Koncept → poprawki → SVG produkcyjny → Biblioteka SVG.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className={`rounded-2xl border px-3 py-2 text-xs ${
                    status?.configured
                      ? "border-emerald-400/15 bg-emerald-400/[.05] text-emerald-200"
                      : "border-amber-400/15 bg-amber-400/[.05] text-amber-100"
                  }`}>
                    {status?.configured
                      ? `${status.provider} · ${status.model}`
                      : "AI czeka na klucz API"}
                  </div>

                  <button
                    onClick={resetForm}
                    className="primary-button"
                  >
                    <Plus className="size-4" />
                    Nowy projekt
                  </button>
                </div>
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

              <div className="mt-6 grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
                <aside className="surface-card overflow-hidden">
                  <div className="p-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/25" />
                      <input
                        value={search}
                        onChange={e =>
                          setSearch(
                            e.target.value
                          )
                        }
                        className="h-10 w-full rounded-xl border border-white/[.07] bg-white/[.025] pl-10 pr-3 text-sm outline-none"
                        placeholder="Szukaj projektu..."
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="grid min-h-56 place-items-center">
                      <LoaderCircle className="size-6 animate-spin text-white/20" />
                    </div>
                  ) : (
                    <div className="max-h-[70vh] divide-y divide-white/[.05] overflow-y-auto">
                      {projects.map(project => (
                        <button
                          key={project.id}
                          onClick={() =>
                            void openProject(
                              project.id
                            )
                          }
                          className={`block w-full px-4 py-4 text-left ${
                            selected?.id === project.id
                              ? "bg-violet-500/[.08]"
                              : "hover:bg-white/[.02]"
                          }`}
                        >
                          <div className="truncate text-sm font-semibold text-white/80">
                            {project.name}
                          </div>
                          <div className="mt-1 text-[10px] text-white/25">
                            {project.project_number}
                            {" · "}
                            {project.versions_count || 0}
                            {" wersji"}
                          </div>
                          {project.order_number && (
                            <div className="mt-1 truncate text-[10px] text-violet-200/50">
                              {project.order_number}
                              {" · "}
                              {project.client_name}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </aside>

                <div className="space-y-5">
                  {(creating || selected) ? (
                    <>
                      <section className="surface-card overflow-hidden">
                        <div className="border-b border-white/[.06] p-5">
                          <div className="font-semibold">
                            {selected
                              ? `${selected.project_number} · ${selected.name}`
                              : "Nowy projekt"}
                          </div>
                        </div>

                        <div className="grid gap-4 p-5 md:grid-cols-2">
                          <label className="field md:col-span-2">
                            <span>Nazwa</span>
                            <input
                              value={name}
                              onChange={e =>
                                setName(
                                  e.target.value
                                )
                              }
                              placeholder="np. Jednorożec JLo Skate"
                            />
                          </label>

                          <label className="field">
                            <span>Typ</span>
                            <select
                              value={projectType}
                              onChange={e =>
                                setProjectType(
                                  e.target.value
                                )
                              }
                            >
                              <option value="lettering">
                                Napis
                              </option>
                              <option value="logo">
                                Logo
                              </option>
                              <option value="social">
                                Social media
                              </option>
                              <option value="graphic">
                                Grafika
                              </option>
                              <option value="custom">
                                Własny
                              </option>
                            </select>
                          </label>

                          <label className="field">
                            <span>Liczba kolorów</span>
                            <select
                              value={colors}
                              onChange={e =>
                                setColors(
                                  Number(
                                    e.target.value
                                  )
                                )
                              }
                            >
                              {[1,2,3,4].map(v => (
                                <option
                                  key={v}
                                  value={v}
                                >
                                  {v}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field md:col-span-2">
                            <span>Brief klienta</span>
                            <textarea
                              value={brief}
                              onChange={e =>
                                setBrief(
                                  e.target.value
                                )
                              }
                              rows={5}
                              placeholder="Co ma znaleźć się na naklejce?"
                            />
                          </label>

                          <label className="field md:col-span-2">
                            <span>Dokładny tekst</span>
                            <input
                              value={textValue}
                              onChange={e =>
                                setTextValue(
                                  e.target.value
                                )
                              }
                              placeholder="Puste = bez tekstu"
                            />
                          </label>

                          <label className="field md:col-span-2">
                            <span>Uwagi produkcyjne</span>
                            <textarea
                              value={notes}
                              onChange={e =>
                                setNotes(
                                  e.target.value
                                )
                              }
                              rows={3}
                            />
                          </label>

                          <label className="field md:col-span-2">
                            <span>ID zamówienia (opcjonalnie)</span>
                            <input
                              value={orderId}
                              onChange={e =>
                                setOrderId(
                                  e.target.value
                                )
                              }
                              inputMode="numeric"
                              placeholder="np. 15"
                            />
                          </label>
                        </div>

                        <div className="flex justify-end border-t border-white/[.06] p-5">
                          <button
                            onClick={() =>
                              void saveProject()
                                .catch(e =>
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Błąd"
                                  )
                                )
                            }
                            disabled={
                              !name.trim()
                              || !brief.trim()
                            }
                            className="primary-button disabled:opacity-40"
                          >
                            <Save className="size-4" />
                            {selected
                              ? "Zapisz"
                              : "Utwórz projekt"}
                          </button>
                        </div>
                      </section>

                      {selected && (
                        <>
                          <section className="surface-card overflow-hidden">
                            <div className="flex flex-col justify-between gap-3 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
                              <div>
                                <div className="font-semibold">
                                  Zdjęcia referencyjne
                                </div>
                                <div className="mt-1 text-xs text-white/30">
                                  PNG / JPG / WEBP.
                                </div>
                              </div>

                              <label className="secondary-button cursor-pointer self-start">
                                <Upload className="size-4" />
                                Dodaj zdjęcie
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/png,image/jpeg,image/webp"
                                  disabled={uploading}
                                  onChange={e => {
                                    const file =
                                      e.target.files?.[0];

                                    if (file) {
                                      void uploadRef(file);
                                    }

                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>

                            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
                              {(selected.references || []).map(ref => (
                                <div
                                  key={ref.id}
                                  className="overflow-hidden rounded-2xl border border-white/[.06]"
                                >
                                  <AuthImage
                                    url={`/api/ai-project-references/${ref.id}/file`}
                                  />
                                  <div className="truncate px-3 pb-3 text-[10px] text-white/30">
                                    {ref.original_filename}
                                  </div>
                                </div>
                              ))}

                              {(selected.references || []).length === 0 && (
                                <div className="text-xs text-white/25">
                                  Brak referencji.
                                </div>
                              )}
                            </div>
                          </section>

                          <section className="surface-card overflow-hidden">
                            <div className="border-b border-white/[.06] p-5">
                              <div className="flex items-center gap-2 font-semibold">
                                <WandSparkles className="size-5 text-violet-300" />
                                Generowanie AI
                              </div>
                            </div>

                            {!status?.configured && (
                              <div className="border-b border-amber-400/15 bg-amber-400/[.04] px-5 py-4 text-sm text-amber-100">
                                Studio działa, ale generowanie czeka na klucz OpenAI API.
                              </div>
                            )}

                            <div className="grid gap-4 p-5 lg:grid-cols-[1fr_150px_170px_auto]">
                              <label className="field">
                                <span>Poprawka / kierunek</span>
                                <input
                                  value={revision}
                                  onChange={e =>
                                    setRevision(
                                      e.target.value
                                    )
                                  }
                                  placeholder="np. mniej detali, większy uśmiech..."
                                />
                              </label>

                              <label className="field">
                                <span>Jakość</span>
                                <select
                                  value={quality}
                                  onChange={e =>
                                    setQuality(
                                      e.target.value
                                    )
                                  }
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

                              <label className="field">
                                <span>Format</span>
                                <select
                                  value={size}
                                  onChange={e =>
                                    setSize(
                                      e.target.value
                                    )
                                  }
                                >
                                  <option value="1024x1024">
                                    Kwadrat
                                  </option>
                                  <option value="1536x1024">
                                    Poziomy
                                  </option>
                                  <option value="1024x1536">
                                    Pionowy
                                  </option>
                                </select>
                              </label>

                              <button
                                onClick={() =>
                                  void generate()
                                }
                                disabled={
                                  generating
                                  || !status?.configured
                                }
                                className="primary-button self-end disabled:opacity-40"
                              >
                                {generating ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <Sparkles className="size-4" />
                                )}
                                Generuj
                              </button>
                            </div>
                          </section>

                          <section className="surface-card overflow-hidden">
                            <div className="flex flex-col justify-between gap-3 border-b border-white/[.06] p-5 sm:flex-row sm:items-center">
                              <div>
                                <div className="font-semibold">
                                  Wersje projektu
                                </div>
                                <div className="mt-1 text-xs text-white/30">
                                  AI = koncept PNG. SVG = finalny plik do cięcia.
                                </div>
                              </div>

                              <label className="secondary-button cursor-pointer self-start border-emerald-400/15 text-emerald-100">
                                <Upload className="size-4" />
                                Dodaj SVG
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".svg,image/svg+xml"
                                  disabled={uploading}
                                  onChange={e => {
                                    const file =
                                      e.target.files?.[0];

                                    if (file) {
                                      void uploadSvg(file);
                                    }

                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>

                            <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
                              {(selected.versions || []).map(version => (
                                <article
                                  key={version.id}
                                  className={`overflow-hidden rounded-3xl border ${
                                    version.is_approved
                                      ? "border-emerald-400/20 bg-emerald-400/[.025]"
                                      : "border-white/[.06] bg-white/[.018]"
                                  }`}
                                >
                                  <div className="relative">
                                    <AuthImage
                                      url={`/api/ai-project-versions/${version.id}/file`}
                                    />

                                    <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px]">
                                      v{version.version}
                                      {" · "}
                                      {version.version_type === "svg"
                                        ? "SVG"
                                        : "AI"}
                                    </div>

                                    {version.is_approved && (
                                      <div className="absolute right-3 top-3 rounded-full bg-emerald-950/80 p-2 text-emerald-200">
                                        <Check className="size-4" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-2 border-t border-white/[.05] p-3">
                                    <button
                                      onClick={() =>
                                        void versionAction(
                                          version,
                                          "approve"
                                        )
                                      }
                                      disabled={
                                        busyVersion === version.id
                                      }
                                      className="secondary-button compact"
                                    >
                                      <Check className="size-4" />
                                      Akceptuj
                                    </button>

                                    <button
                                      onClick={() =>
                                        void download(version)
                                      }
                                      className="secondary-button compact"
                                    >
                                      <Download className="size-4" />
                                      Pobierz
                                    </button>

                                    
                                    {version.version_type === "ai" && (
                                      <PromotionGenerator
                                        versionId={version.id}
                                      />
                                    )}

{version.version_type === "svg" && (
                                      <button
                                        onClick={() =>
                                          void versionAction(
                                            version,
                                            "library"
                                          )
                                        }
                                        disabled={
                                          busyVersion === version.id
                                          || Boolean(
                                            version.svg_asset_id
                                          )
                                        }
                                        className="secondary-button compact border-violet-400/15 text-violet-200 disabled:opacity-40"
                                      >
                                        <FileImage className="size-4" />
                                        {version.svg_asset_id
                                          ? "W bibliotece"
                                          : "Do biblioteki"}
                                      </button>
                                    )}

                                    {!version.svg_asset_id && (
                                      <button
                                        onClick={() =>
                                          void versionAction(
                                            version,
                                            "delete"
                                          )
                                        }
                                        className="secondary-button compact border-red-400/15 text-red-200"
                                      >
                                        <Trash2 className="size-4" />
                                        Usuń
                                      </button>
                                    )}
                                  </div>
                                </article>
                              ))}

                              {(selected.versions || []).length === 0 && (
                                <div className="text-xs text-white/25">
                                  Brak wersji projektu.
                                </div>
                              )}
                            </div>
                          </section>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="surface-card grid min-h-[620px] place-items-center p-8 text-center">
                      <div className="max-w-lg">
                        <ImageIcon className="mx-auto size-12 text-violet-300/25" />
                        <h2 className="mt-4 text-2xl font-semibold">
                          Wybierz projekt albo utwórz nowy
                        </h2>
                        <div className="mt-2 text-sm text-white/35">
                          Tutaj będziemy testować jakość AI i poprawiać workflow pod realne projekty YOKAI WRAP.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
